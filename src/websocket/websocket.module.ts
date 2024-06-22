import { Module, forwardRef } from '@nestjs/common'
import { WebsocketGateway } from './websocket.gateway'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { SensorsModule } from 'src/sensors/sensors.module'

@Module({
  imports: [ConfigModule, forwardRef(() => SensorsModule)],
  providers: [
    {
      provide: 'PORT',
      useFactory: (configService: ConfigService) => {
        return parseInt(configService.get('PORT'), 10) || 3000
      },
      inject: [ConfigService],
    },
    WebsocketGateway,
  ],
  exports: [WebsocketGateway],
})
export class WebsocketModule {}
