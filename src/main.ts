import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { SensorsService } from './sensors/sensors.service'

async function bootstrap () {
  const app = await NestFactory.create(AppModule)
  const sensorsService = app.get(SensorsService)

  const port = process.env.PORT || 3000
  sensorsService.createSensor(port.toString())
  await app.listen(port)
  console.log(`Application is running on: ${await app.getUrl()}`)
}
bootstrap()
