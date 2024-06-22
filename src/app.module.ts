import { Module } from '@nestjs/common'
import { SensorsModule } from './sensors/sensors.module'
import { WebsocketModule } from './websocket/websocket.module'
import { ConfigModule } from '@nestjs/config'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    SensorsModule,
    WebsocketModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
