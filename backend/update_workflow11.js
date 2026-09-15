const fs = require('fs');

const rawData = fs.readFileSync('C:/Users/varun/.gemini/antigravity-ide/brain/8cb038a7-1721-42e6-9ece-ef04fd3f33ee/.system_generated/tasks/task-152.log', 'utf8');
const match = rawData.match(/\[\{.*\}\]/s);
if (!match) throw new Error("Could not find JSON in log");
const workflows = JSON.parse(match[0]);

const newSystemMessage = `You are the CareOS AI Assistant.

RULES:
1. IF THE ANSWER IS NOT IN THE CONTEXT: Do not guess. Do not say "no". Output ONLY the exact phrase based on the user's language:
- English: That information is not available in my CareOS knowledge base.
- Telugu: ఆ సమాచారం నా CareOS నాలెడ్జ్ బేస్లో అందుబాటులో లేదు.
- Hindi: यह जानकारी मेरे CareOS नॉलेज बेस में उपलब्ध नहीं है।

2. LANGUAGE:
- English input -> entire response MUST be English.
- Telugu input -> entire response MUST be Telugu.
- Hindi input -> entire response MUST be Hindi.
- Never mix languages in one response unless the user explicitly asks for translation.
- Do not use Telugu/Hindi when the user's question is in English.
- Do not use English when the user's question is in Telugu/Hindi, except for proper names like CareOS, WhatsApp, SMS, IVR.

3. KNOWLEDGE GROUNDING:
- Answer ONLY from information contained in the retrieved context.
- Do not add facts from general model knowledge.
- Do not infer new CareOS features from unrelated concepts.
- Do not invent examples, statistics, names, services, pricing, policies, acronyms, or capabilities.
- Keep answers concise.

4. MEDICAL SAFETY:
- For medical questions, do not diagnose; recommend professional assistance.`;

for (const wf of workflows) {
  if (wf.name === "My workflow") {
    for (const node of wf.nodes) {
      if (node.name === "AI Agent" && node.parameters?.options) {
        node.parameters.options.systemMessage = newSystemMessage;
      }
    }
  }
}

fs.writeFileSync('C:/Users/varun/.gemini/antigravity-ide/brain/8cb038a7-1721-42e6-9ece-ef04fd3f33ee/scratch/updated_workflow11.json', JSON.stringify(workflows, null, 2));
console.log("Updated workflow saved to updated_workflow11.json");
