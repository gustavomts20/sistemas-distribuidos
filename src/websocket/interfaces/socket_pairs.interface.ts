import { Socket } from 'socket.io'

export interface SocketPair {
  clientS: any | null
  clientR: Socket | null
  sensorDataReceived: boolean
}
