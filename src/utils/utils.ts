import {Observable} from "rxjs";
import {DateTime} from "luxon";


export interface KeyValueArray {
    [key: string]: string | number | boolean
};


export function dayOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
}


export function datumDMJ(ISOdatum: string): string {
    if (ISOdatum.includes(":"))     // er zit ook een tijd in
    {
        const datePart = ISOdatum.split(' ');
        ISOdatum = datePart[0];
    }
    const datum = ISOdatum.split('-');
    return datum[2] + '-' + datum[1] + '-' + datum[0];
}

export function datumDM(ISOdatum: string): string {
    if (ISOdatum.includes(":"))     // er zit ook een tijd in
    {
        const datePart = ISOdatum.split(' ');
        ISOdatum = datePart[0];
    }
    const datum = ISOdatum.split('-');
    return datum[2] + '-' + datum[1];
}

// Hebben we een datum in de toekomst, vandaag is geen toekomst
export  function datumInToekomst(datum: string): boolean {
    const nu: DateTime = DateTime.now();
    const d: DateTime = DateTime.fromSQL(datum);

    return (d > nu) // datum is in het toekomst
}

