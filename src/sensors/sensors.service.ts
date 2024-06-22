import { Inject, Injectable, forwardRef } from '@nestjs/common'
import { Sensor } from './interfaces/sensor.interface'
import { WebsocketGateway } from 'src/websocket/websocket.gateway'

@Injectable()
export class SensorsService {
  private sensorsMap: Map<string, Sensor> = new Map()
  private instanceSensor: Sensor

  constructor (
    @Inject(forwardRef(() => WebsocketGateway))
    private websocketGateway: WebsocketGateway,
  ) {
    this.initLeaderLogging()
  }

  public createSensor (port: string): void {
    const sensorLocation: number = this.sensorsMap.size
    this.instanceSensor = {
      location: sensorLocation,
      batteryLife: this.randomIntFromInterval(1, 100),
      connectivityStrength: this.randomIntFromInterval(1, 5),
      computationalPower: this.randomIntFromInterval(1, 1000),
      leader: false,
    }
    this.sensorsMap.set(port, this.instanceSensor)
  }

  public getSensor (): Sensor {
    return this.instanceSensor
  }

  public getSensorByPort (port: string): Sensor | undefined {
    return this.sensorsMap.get(port)
  }

  public updateSensor (port: string, sensor: Sensor): void {
    this.sensorsMap.set(port, sensor)
  }

  public deleteSensor (port: string): void {
    this.sensorsMap.delete(port)
  }

  /**
   * O método séra chamado quando um novo sensor entrar na rede
   * ou quando os sensores detectarem que o lider atual não está respondendo
   *
   * A escolha se da com base na pontuação que é uma media da vida de bateria,
   * força da conexão e poder computacional do sensor
   *
   * Na escolha do lider da instância atual, chamamos o método broadcastLeaderElection
   * para altertar outras instâncias da nossa escolha como lider
   */
  public updateLeadership (): string | null {
    let maxScore = 0
    let leaderPort: string | null = null

    this.sensorsMap.forEach((sensor, port) => {
      const score =
        sensor.batteryLife +
        sensor.connectivityStrength * 10 +
        sensor.computationalPower
      if (score > maxScore) {
        maxScore = score
        leaderPort = port
      }
    })

    if (leaderPort) {
      this.setLeader(leaderPort)
    }

    return leaderPort
  }

  private randomIntFromInterval (min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1) + min)
  }

  private initLeaderLogging (): void {
    setInterval(() => {
      console.log(this.sensorsMap)
      const leader = Array.from(this.sensorsMap.entries()).find(
        ([port, sensor]) => sensor.leader,
      )
      if (leader) {
        console.log(
          `Líder atual: Porta ${leader[0]} Detalhes: ${JSON.stringify(
            leader[1],
          )}`,
        )
      } else {
        console.log('Nenhum líder selecionado no momento.')
      }
    }, 10000)
  }

  public isLeader (port: string): boolean {
    const sensor = this.sensorsMap.get(port)
    return sensor ? sensor.leader : false
  }

  public setLeader (leaderPort: string): void {
    this.sensorsMap.forEach((sensor, port) => {
      sensor.leader = port === leaderPort
    })
  }
}
