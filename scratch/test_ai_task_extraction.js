const dotenv = require('dotenv');
dotenv.config();

async function testExtraction() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.AI_MODEL || 'gpt-4o-mini';

  console.log(`[Test] Testing extractTasksFromText with model: "${model}"`);

  const sampleCircularText = `
RESERVE BANK OF INDIA
DEPARTMENT OF REGULATION
CENTRAL OFFICE, MUMBAI

RBI/2024-25/112
DOR.ACC.REC.No.45/21.04.018/2024-25
May 15, 2024

All Scheduled Commercial Banks (excluding RRBs)
All Small Finance Banks
All Primary (Urban) Co-operative Banks

Dear Sir / Madam,

Implementation of Indian Accounting Standards (Ind AS) - Asset Classification and Provisioning

1. Please refer to our circular DOR.No.BP.BC.23/21.04.018/2019-20 dated March 22, 2019 on the captioned subject.
2. In order to align regulatory guidelines with standard accounting practices, all covered banks shall ensure that:
   (a) Board of Directors shall approve a comprehensive credit risk management policy before September 30, 2024.
   (b) The bank shall compute Expected Credit Loss (ECL) on a quarterly basis and submit returns to RBI starting from Q3 FY 2024-25.
   (c) An independent audit of the ECL computation models shall be conducted by an external statutory auditor before December 31, 2024.
   (d) Failure to comply with these directions shall attract penalty under Section 47A of the Banking Regulation Act, 1949.

Yours faithfully,
(Chief General Manager)
  `;

  const messages = [
    {
      role: 'system',
      content: `You are a senior banking compliance analyst. Read the following regulatory circular and extract metadata and specific actionable compliance tasks.
IMPORTANT: Extract any mandatory regulatory amendments, operational requirements, reporting deadlines, board/committee approvals, system changes, or compliance action items that a regulated bank/financial entity must perform.

Return ONLY a valid JSON object matching this exact schema:
{
  "reference_no": "string (The official circular reference number, e.g. RBI/2023-24/123 or DOR.ACC.REC.102/21.04.018/2025-26. Look closely at the header and first page, do not return null if a reference number is mentioned) or null",
  "title": "string (The official subject/title of the circular, e.g. Master Direction - Know Your Customer (KYC) Direction, 2016. Do not put reference number here) or null",
  "published_date": "string (The official publication date in YYYY-MM-DD format, e.g. 2026-06-24) or null",
  "priority": "High, Medium, or General",
  "circular_type": null,
  "description": "A concise 1-2 sentence executive summary of the circular's objective",
  "is_penalty_applicable": boolean,
  "penalty_amount": number (or null),
  "penalty_description": "string (or null)",
  "tasks": [
    {
      "description": "Clear, actionable, self-contained compliance task or operational instruction for the bank/department."
    }
  ]
}
If no explicit tasks are found, formulate 1 to 3 standard review/implementation tasks based on the circular's directions.
No explanation, no markdown code fence, no extra text. Only the JSON object.`
    },
    {
      role: 'user',
      content: `Circular Text:\n${sampleCircularText.substring(0, 35000)}\n\nJSON:`
    }
  ];

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        response_format: { type: 'json_object' },
        temperature: 0.1
      })
    });

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);
    console.log('\n Extracted JSON Result:');
    console.log(JSON.stringify(result, null, 2));
    console.log(`\n Number of Tasks Extracted: ${result.tasks?.length || 0}`);
  } catch (err) {
    console.error('Error during extraction test:', err);
  }
}

testExtraction();
