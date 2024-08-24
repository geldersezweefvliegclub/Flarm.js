import {Injectable} from "@nestjs/common";
import * as process from "node:process";
import * as fs from "node:fs";


@Injectable()
export class StorageService {
    vervalTijd: number = 60;  // 60 min

    public opslaan(key:string, value:any, tijd : number = this.vervalTijd): void {
        const now = new Date()

        const tijdMsec = tijd * 1000 * 60 // van minuten naar msec
        let expireTimestamp = now.getTime() + tijdMsec;

        if (tijd < 0) {
            expireTimestamp = now.setDate(now.getDate() + 5000);  // 5000 dagen vooruit
        }

        const item = {
            value: value,
            expiry: expireTimestamp
        }

        fs.writeFileSync(this.fileNaam(key), JSON.stringify(item));
    }

    public ophalen(key:string): any {
        const bestandsNaam = this.fileNaam(key);

        const jsonString:string | null = (fs.existsSync(bestandsNaam)) ? fs.readFileSync(bestandsNaam, 'utf8') : null;

        if (jsonString == null)
            return null;

        const item = JSON.parse(jsonString);
        const now = new Date()
        // compare the expiry time of the item with the current time
        if (now.getTime() > item.expiry) {
            // If the item is expired, delete the item from storage
            // and return null
            fs.unlink(this.fileNaam(key),  () => {});
            return null;
        }
        return item.value;
    }

    public verwijder(key: string): void {
        localStorage.removeItem(key)
    }

    fileNaam(key: string): string {

        const sDir = process.cwd() + '/chache/';

        if (!fs.existsSync(sDir)) {
            fs.mkdirSync(sDir, {recursive: true});
        }
        return sDir + key + '.json';
    }
}
