import { Module, forwardRef } from '@nestjs/common'
import { SensorsService } from './sensors.service'
import { WebsocketModule } from 'src/websocket/websocket.module'

@Module({
  imports: [forwardRef(() => WebsocketModule)],
  providers: [SensorsService],
  exports: [SensorsService],
})
export class SensorsModule {}
