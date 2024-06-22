import { Inject, forwardRef } from '@nestjs/common'
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { io } from 'socket.io-client'
import { SensorsService } from 'src/sensors/sensors.service'
import { SocketPair } from './interfaces/socket_pairs.interface'
import { Sensor } from 'src/sensors/interfaces/sensor.interface'

@WebSocketGateway({ cors: true })
export class WebsocketGateway implements OnGatewayDisconnect {
  @WebSocketServer() server: Server
  /**
   *
   * Um map, a chave é a porta onde a instância está executando e em seguida temos
   * o socket Pair, onde temos o clientS e o clientR, o primeio é o socket utilizado
   * para enviar mensagens para outras instâncias (send), o segundo é o socket que
   * foi recebido de outras instâncias received
   */
  private clients: Map<string, SocketPair> = new Map()

  public selfPort: number
  private consensusCounter: number

  //Das variaveis de ambiente obtemos a PORTA
  constructor (
    @Inject('PORT') selfPort: number,
    @Inject(forwardRef(() => SensorsService))
    private sensorsService: SensorsService,
  ) {
    this.selfPort = selfPort
    this.connectToPeers()
    this.logClientKeys()
  }

  private logClientKeys () {
    setInterval(() => {
      const keys = Array.from(this.clients.keys())
      //console.log('Portas conectadas atualmente: ', keys.join(', '))
    }, 10000)
  }

  /**
   * No momento em que uma instância inicia, ela tenta se conectar
   * com outra instâncias através do método connectToPeers, que em um range predefinido
   * de portas verifica se o servidor websocket se encontra operante ou não.
   *
   * Se a conexão cliente for um sucesso (io(url, { reconnection: false }))
   *
   * Ele envia uma mensagem register para que ambos os servidores estejam mutualmente
   * conectados como clientes e servidores.
   *
   * Att: Foi adicionada uma para ambos os tipos de socket,
   * 1. Quando eu me conecto com o servidor, eu tenho o socket do tipo client_s que consegue
   * enviar mensagens para aquele servidor
   * 2. Quando eu recebo uma mensagem daquele servidor tenho outro tipo de socket definido aqui
   * como client_r utilizado na desconexão
   */
  connectToPeers () {
    const startPort = 3000
    const endPort = 3010
    for (let port = startPort; port <= endPort; port++) {
      if (port !== this.selfPort) {
        const url = `http://localhost:${port}`
        const client_s = io(url, { reconnection: false })
        const portKey = port.toString()

        client_s.on('connect', () => {
          const socketPair = this.clients.get(portKey) || {
            clientS: null,
            clientR: null,
            sensorDataReceived: false,
          }
          socketPair.clientS = client_s
          this.clients.set(portKey, socketPair)

          client_s.emit('connect_back', { port: this.selfPort.toString() })
        })
      }
    }
  }

  /**
   *
   * @param data
   * @param client
   *
   * Quando um cliente envia a mensagem connect_back, o servidor precisa tentar
   * se conectar como cliente de volta. Assim ambas instâncias serão clientes e servidores
   *
   * Nesse método é informada a porta e com ela formada a url.
   *
   * Após a conexão ser estabelecida com sucesso, a porta e seu respectivo socket no servidor atual
   * são salvas no mapa, enviamos então uma nova mensagem acknowledge_connection
   */
  @SubscribeMessage('connect_back')
  async onConnectBack (
    @MessageBody() data: { port: string },
    @ConnectedSocket() client_r: Socket,
  ): Promise<void> {
    const portKey = data.port

    if (!this.clients.has(portKey)) {
      const url = `http://localhost:${portKey}`
      const client_s = io(url, { reconnection: false })

      client_s.on('connect', () => {
        const socketPair = this.clients.get(portKey) || {
          clientS: null,
          clientR: null,
          sensorDataReceived: false,
        }
        socketPair.clientS = client_s
        socketPair.clientR = client_r
        this.clients.set(portKey, socketPair)

        this.requestSensorData(portKey)

        client_s.emit('acknowledge_connection', {
          port: this.selfPort.toString(),
        })
      })
    }
  }

  /**
   *
   * @param data
   * @param client_c
   *
   * Esse método serve para que o servidor que se conectou
   * na etapa connectToPeers também possa adicionar o socket do cliente
   * recém conectado ao seu servidor a sua map
   */
  @SubscribeMessage('acknowledge_connection')
  async onAcknowledgeConnection (
    @MessageBody() data: { port: string },
    @ConnectedSocket() client_r: Socket,
  ): Promise<void> {
    const portKey = data.port

    let socketPair = this.clients.get(portKey) || {
      clientS: null,
      clientR: null,
      sensorDataReceived: false,
    }

    if (!socketPair.clientR) {
      socketPair.clientR = client_r
      this.clients.set(portKey, socketPair)
    }

    this.requestSensorData(portKey)
  }

  /**
   *
   * @param client
   *
   * Na desconexão recebemos o socket que está se desconectando e precisamos retira-lo
   * do map do servidor websocket atual, isso é feito comparando os ids
   */
  handleDisconnect (client: Socket) {
    for (const [key, value] of this.clients.entries()) {
      if (value.clientR.id === client.id) {
        const wasLeader = this.sensorsService.isLeader(key)
        this.clients.delete(key)
        this.sensorsService.deleteSensor(key)
        console.log(`Cliente desconectado e removido na porta: ${key}`)
        if (wasLeader) {
          console.log(
            `Líder na porta ${key} foi desconectado. Iniciando eleição de novo líder.`,
          )
          const leaderPort = this.sensorsService.updateLeadership()
          if (leaderPort) {
            if (leaderPort == this.selfPort.toString()) {
              this.consensusCounter++
              break
            }
            this.broadcastLocalLeaderElection(leaderPort)
          }
        }
        break
      }
    }
  }

  /**
   * Solicita informação de todos os outros sensores conectados na rede
   * emitindo a mensagem request_sensor_data para cada socket salvo no
   * map clients
   */
  public requestSensorData (port: string) {
    const clientInfo = this.clients.get(port)
    if (clientInfo && clientInfo.clientS) {
      clientInfo.clientS.emit('request_sensor_data', {
        port: this.selfPort.toString(),
      })
    } else {
      console.log(`Cliente na porta ${port} não está conectado`, {
        instance: this.selfPort,
      })
    }
  }

  /**
   *
   * @param data
   * @param client_c
   *
   * Solicita a informação do sensor de determinada instância
   * através do PORT salvo no map clients e envia a resposta com
   *
   * emit('sensor_response' ...
   *
   */
  @SubscribeMessage('request_sensor_data')
  async onRequestSensorData (
    @MessageBody() data: { port: number },
    @ConnectedSocket() client_c: Socket,
  ): Promise<void> {
    const sensor = this.sensorsService.getSensor()
    const clientInfo = this.clients.get(data.port.toString())
    if (clientInfo && clientInfo.clientS) {
      clientInfo.clientS.emit('sensor_response', {
        sensor,
        port: this.selfPort.toString(),
      })
    } else {
      console.log(`Cliente na porta ${data.port} não está conectado`, {
        instance: this.selfPort,
      })
    }
  }

  /**
   *
   * @param data
   * @param client_c
   *
   * Obtém a informação de um sensor individual de determinada instância
   * e atualiza seu map de sensores
   */
  @SubscribeMessage('sensor_response')
  async onSensorResponse (
    @MessageBody() data: { sensor: Sensor; port: string },
    @ConnectedSocket() client_c: Socket,
  ): Promise<void> {
    this.sensorsService.updateSensor(data.port, data.sensor)
    const clientInfo = this.clients.get(data.port)
    if (clientInfo) {
      clientInfo.sensorDataReceived = true
      this.clients.set(data.port, clientInfo)
      this.checkIfAllDataReceived()
    }
  }

  private checkIfAllDataReceived (): void {
    const allReceived = Array.from(this.clients.values()).every(
      client => client.sensorDataReceived,
    )
    if (allReceived) {
      const leaderPort = this.sensorsService.updateLeadership()
      if (leaderPort) {
        this.broadcastLeaderElection(leaderPort)
      }
    }
  }

  private broadcastLeaderElection (leaderPort: string): void {
    this.clients.forEach(socketPair => {
      socketPair.clientS?.emit('leader_election', { leaderPort })
    })
  }

  private broadcastLocalLeaderElection (leaderPort: string): void {
    const clientInfo = this.clients.get(leaderPort)
    if (clientInfo) {
      clientInfo.clientS.emit('selected_leader')
    }
  }

  @SubscribeMessage('leader_election')
  async onLeaderElection (
    @MessageBody() data: { leaderPort: string },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    this.consensusCounter = 0
    this.sensorsService.setLeader(data.leaderPort)
  }

  @SubscribeMessage('selected_leader')
  async onLocalVoting (@ConnectedSocket() client: Socket): Promise<void> {
    this.consensusCounter++
    const requiredMajority = Math.ceil((this.clients.size + 1) / 2)

    console.log(`Voto recebido. Votos atuais: ${this.consensusCounter}`)

    if (this.consensusCounter >= requiredMajority) {
      console.log(
        `Consenso estabelecido, sensor ${this.selfPort} selecionado como líder.`,
      )
      this.broadcastLeaderElection(this.selfPort.toString())
      this.consensusCounter = 0
    }
  }
}
