import { DateTime } from "luxon";
export class AprsMessage
{
    callsign: string;
    timestamp: string;
    latitude: number;
    longitude: number;
    altitude: number;
    course: number;
    speed: number;
    climbRate: number;
    turnRate: string;
    flarmId: string | null = null

    receivedTime: DateTime;             // The time this message was received

    constructor(message: string){
        const regex = /(\w+)>OGFLR,qAS,\w+:\/(\d{6})h(\d{2})(\d{2}\.\d{2})([NS])\/(\d{3})(\d{2}\.\d{2})([EW])'(\d{3})\/(\d{3})\/A=(\d{6}) !W\w{2}! id([A-F\d]{2})([A-F\d]{6}) ([+-]\d+\w+) ([+-]?\d+\.\d+rot)/;
        const match = message.match(regex);

        if (match) {
            this.callsign = match[1]
            this.timestamp = match[2];
            this.latitude = parseInt(match[3], 10) + parseFloat(match[4]) / 60;  // Convert latitude from degrees and minutes to decimal degrees
            this.longitude = parseInt(match[6], 10) + parseFloat(match[7]) / 60; // Convert longitude from degrees and minutes to decimal degrees
            this.altitude = Math.round(parseInt(match[11], 10) * 0.3048)      // Convert altitude from feet to meters;
            this.course = parseInt(match[9], 10);
            this.speed = Math.round(parseInt(match[10], 10) * 1.852);           // Convert speed from knots to km/h
            this.climbRate = Math.round(100 * parseFloat(match[14]) * 0.00508) / 100; // Convert climb rate from feet per minute to meters per second
            this.flarmId = match[13];
            this.turnRate = match[15];

            this.latitude = (match[5] == "S") ? -this.latitude : this.latitude;
            this.longitude = (match[8] == "W") ? -this.longitude : this.longitude;

            this.receivedTime = DateTime.now();
        }
    }
}


