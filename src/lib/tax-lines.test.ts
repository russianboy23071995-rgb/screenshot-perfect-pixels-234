import { describe, expect, it } from 'vitest';
import { summarize, vatSummary, type Transaction } from './finance';
import { allocateGross, bewirtungMissing, inputTaxCents, mainRate, sumLines } from './tax-lines';
const lines = [{rate:7,net_cents:8000,tax_cents:560},{rate:19,net_cents:2000,tax_cents:380}];
const t = { type:'expense', booking_status:'freigegeben',payment_status:'paid',payment_date:'2026-10-27',is_demo:false, net_cents:11000,tax_cents:940,gross_cents:11940,tax_lines:lines,tip_cents:1000,deductible:'partial',deductible_percent:70,input_tax_percent:100,deductible_tax_cents:940 } as Transaction;
describe('Steuerzeilen und Abzüge',()=>{
 it('Fall A mindert Gewinn um 77 EUR, Vorsteuer bleibt 9,40 EUR',()=>{expect(summarize([t])).toMatchObject({profit:-7700,expenseDeductible:7700,expenseNonDeductible:3300,inputTax:940});});
 it('Einnahme aus zwei Sätzen',()=>{expect(vatSummary([{...t,type:'income',net_cents:15000,tax_cents:2250,tax_lines:[{rate:19,net_cents:10000,tax_cents:1900},{rate:7,net_cents:5000,tax_cents:350}]}]).outputByRate).toEqual({19:{net:10000,tax:1900},7:{net:5000,tax:350}});});
 it('Storno hebt Steuerzeilen und Trinkgeld auf',()=>{const counter={...t,net_cents:-11000,tax_cents:-940,gross_cents:-11940,tip_cents:-1000,deductible_tax_cents:-940,tax_lines:lines.map(l=>({...l,net_cents:-l.net_cents,tax_cents:-l.tax_cents}))};expect(sumLines([...t.tax_lines,...counter.tax_lines],t.tip_cents+counter.tip_cents)).toEqual({net:0,tax:0,gross:0});expect(summarize([t,counter]).profit).toBe(0);expect(vatSummary([t,counter]).inputTax).toBe(0);});
 it('Vorsteuer separat zu 100 Prozent',()=>expect(inputTaxCents('expense',940,100)).toBe(940));
 it('Hauptsatz bei Gleichstand höher',()=>expect(mainRate([{rate:7,net_cents:100,tax_cents:7},{rate:19,net_cents:100,tax_cents:19}])).toBe(19));
 it('Fremdwährung Centrest ergibt exakten Bankbetrag',()=>{const c=allocateGross(lines,1000,10001);expect(sumLines(c.lines,c.tip).gross).toBe(10001);});
 it('Geschäftliche Freigabe benötigt Anlass und Teilnehmer',()=>expect(bewirtungMissing({art:'geschaeftlich'},11940)).toEqual(['Bewirtungsanlass','Teilnehmer']));
 it('Privat ist nicht freigabefähig',()=>expect(bewirtungMissing({art:'privat',anlass:'X',teilnehmer:['A']},10000)).toContain('Bewirtungsart'));
 it('Über 250 EUR sind Rechnungsangaben nötig',()=>expect(bewirtungMissing({art:'mitarbeiter',anlass:'X',teilnehmer:['A']},25001)).toContain('vollständige Rechnungsangaben bestätigt'));
 it('Genau 250 EUR ohne zusätzliche Bestätigung',()=>expect(bewirtungMissing({art:'mitarbeiter',anlass:'X',teilnehmer:['A']},25000)).toEqual([]));
});
