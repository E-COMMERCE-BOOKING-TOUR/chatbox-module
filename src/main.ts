import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap() {
    // Create the Hybrid Application (HTTP + Microservices)
    const app = await NestFactory.create(AppModule);

    // Connect the Microservice Strategy (TCP)
    // We use a different port for TCP to avoid conflict with HTTP/WS port
    app.connectMicroservice<MicroserviceOptions>({
        transport: Transport.TCP,
        options: {
            host: '0.0.0.0',
            port: Number(process.env.CHATBOX_TCP_PORT),
        },
    });

    app.enableCors({
        origin: '*', // Allow all for dev
    });

    await app.startAllMicroservices();

    // HTTP/WebSocket server listens on the main PORT
    await app.listen(process.env.PORT as string);
    console.log(`Chatbot service HTTP/WS is listening on port ${process.env.PORT}`);
    console.log(`Chatbot service TCP is listening on port ${process.env.CHATBOX_TCP_PORT}`);
}
bootstrap();