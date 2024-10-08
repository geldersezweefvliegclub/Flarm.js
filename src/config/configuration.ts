
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { join } from 'path';
import {v4 as uuidv4} from 'uuid';
import { dayOfYear } from '../utils/utils';
import {Logger} from "@nestjs/common";


const YAML_CONFIG_FILENAME = 'flarm-config.yaml';

interface FlarmConfig { // Define the configuration interface
    OGN: {
        simulator: string
        aprsServer: string;
        aprsPort: number;
        aprsUser: string;
        aprsPass: string;
        aprsName: string;
        aprsVersion: string;
        aprsFilter: string;
    }
    Helios: {
        url: string;
        username: string;
        password: string;
        token: string;
    }
    Vliegveld: {
        code: string;
        hoogte: number;

        Banen?: {
            code: string;
            GeoJSON: string;
        }[];
    }
}
export default () => {
    const flarmConfig: FlarmConfig = {
        OGN:
            {
            simulator: null,
            aprsServer: 'aprs.glidernet.org',
            aprsPort: 14580,
            aprsUser: '',
            aprsPass: "-",
            aprsName: 'node-ogn',
            aprsVersion: "0.0.1",
            aprsFilter: "r/52.06/5.94/150"
        },
        Helios: {
            url: 'http://helios:3000',
            username: 'gebruiker',
            password: 'wachtwoord',
            token: '',
        },
        Vliegveld: {
            code: 'EHTL',
            hoogte: 80,

            Banen: undefined
        }
    }
    flarmConfig.OGN.aprsUser = uuidv4().split('-')[0].toUpperCase();

    const configFile = join(process.cwd(), '/', YAML_CONFIG_FILENAME)
    const logger = new Logger()
    try
    {
        const cfg = yaml.load(fs.readFileSync(configFile, 'utf8')) as Record<string, any>;

        Object.keys(cfg).forEach((key) => {
            if (flarmConfig[key]) {
                flarmConfig[key] = { ...flarmConfig[key], ...cfg[key] };
            }
        });
    }
    catch (e) {
        logger.error(`Failed to load configuration from ${configFile}: ${e.message}`);
    }

    const today = new Date()
    flarmConfig.Helios.token = dayOfYear(today).toString() + flarmConfig.Helios.token;

    return flarmConfig;
};