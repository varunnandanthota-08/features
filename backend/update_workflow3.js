const fs = require('fs');

const rawData = fs.readFileSync('C:/Users/varun/.gemini/antigravity-ide/brain/8cb038a7-1721-42e6-9ece-ef04fd3f33ee/.system_generated/tasks/task-152.log', 'utf8');
const match = rawData.match(/\[\{.*\}\]/s);
if (!match) throw new Error("Could not find JSON in log");
const workflows = JSON.parse(match[0]);

const newSystemMessage = `You are the CareOS AI Assistant.

CRITICAL LANGUAGE RULES:
1. Detect the language of the user's input.
2. If the user writes in English, you MUST reply in English. Do NOT reply in Telugu or Hindi, even if the retrieved knowledge base text is in Telugu or Hindi.
3. If the user writes in Telugu, you MUST reply in Telugu.
4. If the user writes in Hindi, you MUST reply in Hindi.
5. You MUST translate retrieved information to match the user's input language.

KNOWLEDGE BASE & FACTUAL ACCURACY:
- Use the retrieved knowledge base to answer questions about CareOS.
- NEVER invent features, names, products, acronyms, pricing, or technical details.
- If the knowledge base does not contain the answer, explicitly state that the information is not available.
- Do NOT guess, do NOT introduce unrelated acronyms, and do NOT use fabricated terms.
- Answer concisely.
- Preserve factual wording from the knowledge base where possible.

EMERGENCIES:
- For medical/emergency topics, clearly state that the AI is not a substitute for professional emergency/medical care.`;

for (const wf of workflows) {
  if (wf.name === "My workflow") {
    for (const node of wf.nodes) {
      if (node.name === "AI Agent" && node.parameters?.options) {
        node.parameters.options.systemMessage = newSystemMessage;
      }
    }
  }
}

fs.writeFileSync('C:/Users/varun/.gemini/antigravity-ide/brain/8cb038a7-1721-42e6-9ece-ef04fd3f33ee/scratch/updated_workflow3.json', JSON.stringify(workflows, null, 2));
console.log("Updated workflow saved to updated_workflow3.json");
