// Fictional test letters. Every person, company, number and address is invented.
// `pii` is the ground truth used by the eval panel (PII recall / precision).

export const SAMPLES = [
  {
    id: 'medical_bill',
    title: 'Medical bill',
    scam: false,
    text: `CASCADE VALLEY MEDICAL CENTER (FICTIONAL SAMPLE)
1200 Alder Way, Rivermark, WA 98000

STATEMENT DATE: 10/28/2026
Patient: Mei-Ling Zhou
Date of Birth: 03/14/1952
Patient Account #: CVMC-8841207
Guarantor: Mei-Ling Zhou
Mailing address: 4417 Juniper Ct NE, Lakeview, WA 98001

Service date 09/30/2026 - Emergency department visit, level 4
Diagnosis: atrial fibrillation
Total charges:            $4,312.00
Insurance paid:           $3,118.40
Adjustments:                $612.10
PATIENT BALANCE DUE:        $581.50
Please pay by 11/27/2026.

Questions? Call Patient Financial Services at (555) 201-7781.
Financial assistance may be available. Ask us about a payment plan.`,
    pii: [
      'Mei-Ling Zhou',
      '03/14/1952',
      'CVMC-8841207',
      '4417 Juniper Ct NE, Lakeview, WA 98001',
      'atrial fibrillation',
    ],
  },
  {
    id: 'insurance_eob',
    title: 'Insurance EOB',
    scam: false,
    text: `PINECREST MUTUAL HEALTH (FICTIONAL SAMPLE)
EXPLANATION OF BENEFITS - THIS IS NOT A BILL

Member: Guo-Hua Lin
Member ID: PMH443920118
Group #: 77120
Claim number: 2026-11-004513
Provider: Northgate Imaging Associates

Service: MRI lumbar spine without contrast   09/12/2026
Amount billed:          $2,450.00
Plan discount:          $1,380.00
Plan paid:                $856.00
Your deductible:          $214.00
YOU MAY OWE PROVIDER:     $214.00

If you disagree with this decision you may file an appeal within 180 days.
Member Services: 1-555-410-2200 (TTY 711)`,
    pii: ['Guo-Hua Lin', 'PMH443920118', '77120', '2026-11-004513', 'MRI lumbar spine without contrast'],
  },
  {
    id: 'toll_scam',
    title: 'Toll scam letter',
    scam: true,
    text: `EVERGREEN STATE TOLL COLLECTIONS DIVISION (FICTIONAL SAMPLE)
FINAL NOTICE - IMMEDIATE ACTION REQUIRED

Dear Jian Wu,
Our records show an unpaid toll balance of $12.75 on your vehicle plate 7KQX219.
Failure to pay within 24 HOURS will result in a $250 penalty, suspension of your
driver license, and referral to law enforcement.

Pay now at evergreen-toll-pay.co/settle or call 555-019-4472.
We also accept payment by gift card (Target, Apple) for faster processing.
Have your Social Security Number ready: we will verify identity by phone.

Your case ID: ETC-55120-A`,
    pii: ['Jian Wu', '7KQX219', 'ETC-55120-A'],
  },
  {
    id: 'tax_notice',
    title: 'Tax notice',
    scam: false,
    text: `STATE DEPARTMENT OF REVENUE (FICTIONAL SAMPLE)
Notice date: October 30, 2026        Notice number: DR-26-118804

Taxpayer: Hong Chen and Li Chen
SSN: 555-42-1987
Address: 88 Larch Lane, Apt 3B, Northbend, WA 98002

We changed your 2025 return. Our records show you did not report interest
income of $1,204 from First Harbor Savings account ending 6612.
Amount you owe: $187.40 including interest.

If you agree, pay by December 1, 2026 through the official website shown on
your previous year's tax booklet, or mail a check with the payment voucher.
If you disagree, call us at the number on our official website within 30 days.
We will never ask for payment by gift card or cryptocurrency.`,
    pii: ['Hong Chen and Li Chen', '555-42-1987', '88 Larch Lane, Apt 3B, Northbend, WA 98002', '6612'],
  },
];
