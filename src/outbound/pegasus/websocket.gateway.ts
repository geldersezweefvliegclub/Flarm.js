import {OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer} from '@nestjs/websockets';
import {Logger} from "@nestjs/common";
import {Server, Socket} from "socket.io";
import {EventEmitter2, OnEvent} from "@nestjs/event-emitter";
import {FlarmEvents} from "../../shared/FlarmEvents";
import {WebSocketEvents} from "../../shared/WebSocketEvents";

@WebSocketGateway(undefined, {cors: true, pingInterval: 5000, pingTimeout: 3000})
export class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect
{
    private readonly logger = new Logger(WebsocketGateway.name);

    @WebSocketServer()
    private server: Server;

    constructor(private readonly eventEmitter: EventEmitter2) {
    }

    handleConnection(client: Socket, ...args: any[]) {
        this.logger.log(`Client connected: ${client.id}`);

        client.emit('connection', 'Successfully connected to the server');
        this.eventEmitter.emit(WebSocketEvents.OnConnect);
    }
    handleDisconnect(client: Socket) {
        this.logger.log(`Client disconnected: ${client.id}`);
    }

    @OnEvent(WebSocketEvents.SendFlarmMessage)
    SendFlarmMessage(payload:any){
        this.server.emit('flarm', payload);
    }

    @OnEvent(WebSocketEvents.SendStartMessage)
    SendStartMessage(payload:any){
        this.logger.log('Sending start message');
        this.server.emit('start', payload);
    }
}
