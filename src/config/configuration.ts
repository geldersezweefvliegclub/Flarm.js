
import { readFileSync } from 'fs';
import * as yaml from 'js-yaml';
import { join } from 'path';
import {fileExistsSync} from "tsconfig-paths/lib/filesystem";
import {v4 as uuidv4} from 'uuid';
import { dayOfYear } from '../utils/utils';


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
        GeoJSON: string;
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
            GeoJSON: undefined,
        }
    }
    flarmConfig.OGN.aprsUser = uuidv4().split('-')[0].toUpperCase();

    const configFile = join(process.cwd(), '/', YAML_CONFIG_FILENAME)

    if (fileExistsSync(configFile))
    {
        const cfg = yaml.load(
            readFileSync(configFile, 'utf8'),
        ) as Record<string, any>;

        Object.keys(cfg).forEach((key) => {
            if (flarmConfig[key]) {
                flarmConfig[key] = { ...flarmConfig[key], ...cfg[key] };
            }
        });
    }

    const today = new Date()
    flarmConfig.Helios.token = dayOfYear(today).toString() + flarmConfig.Helios.token;

    return flarmConfig;
};