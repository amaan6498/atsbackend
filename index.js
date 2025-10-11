import express from "express";
import multer from "multer";
import fs from "fs";
import pdfParse from "pdf-parse";
import dotenv from "dotenv";
dotenv.config();
import { GoogleGenAI } from "@google/genai";

const app = express();
const port = process.env.PORT || 5000;
app.use(express.json());
const ai = new GoogleGenAI({
  apiKey: process.env.API_KEY,
});

// Set up multer for file upload
const upload = multer({ dest: "uploads/" });

// Instructions for the language model
const instructions = `You are a Resume Evaluation Assistant. Your task is to analyze a candidate's resume based on a provided job role and candidate type (Fresher or Experienced). You must evaluate all aspects of the resume, score it, provide ratings, breakdowns, and improvement suggestions.
Input:
- "resume": a string containing the resume content.
- "job_role": a string describing the job role.
- "candidate_type": "Fresher" or "Experienced".

Resume Aspects to Evaluate:
1. Contact Information
2. Professional Summary / Objective
3. Skills (technical and soft skills)
4. Work Experience / Projects
5. Education
6. Certifications & Trainings
7. Achievements / Awards / Extracurriculars (optional but valuable)
8. Formatting, clarity, and structure

Output Requirements:
- The response MUST always be in JSON format, no matter what.
- Output ONLY valid, minified JSON. Do not include any text, markdown, or explanations. Do not use escape characters. Do not wrap the JSON in code blocks.
- In the output JSON, always include a "missing_skills" array listing all important skills, technologies, or qualifications required for the job_role that are missing or insufficiently covered in the resume.
- The "missing_skills" array should be as specific as possible (e.g., "Spring Boot", "REST API development", "JUnit testing", "CI/CD pipelines", etc.).
- If all required skills are present, return an empty array for "missing_skills".

Example JSON for a valid resume:
{
  "valid": true, 
  "score": 52, 
  "rating": "Average", 
  "breakdown": {
    "contact_info": 0,
    "summary_objective": 70,
    "skills": 70,
    "experience_projects": 60,
    "education": 80,
    "certifications_trainings": 70,
    "achievements_extracurriculars": 0,
    "formatting_clarity": 60,
    "relevance_to_job": 50
  },
  "missing_sections": {
    "contact_info": "Add comprehensive contact information (phone, email, LinkedIn).",
    "experience_projects": "Showcase at least one Java backend project (e.g., Spring Boot REST API, Servlets).",
    "achievements_extracurriculars": "Include achievements or extracurricular activities relevant to software development."
  },
  "improvement_suggestions": [
    "Highlight any Java certifications or coursework (Oracle Certified Associate, Java SE).",
    "Emphasize experience with version control (Git) and CI/CD pipelines.",
    "Refine formatting: use consistent bullet style, clear section headings, and remove unrelated skills (e.g., video editing).",
    "For the To‑Do List project, detail backend architecture and any MVC implementation.",
    "Add a summary of technical stack specific to the Java Developer role."
  ],
  "notes": "Resume contains foundational skills but lacks specific Java backend experience crucial for a Java developer fresher role."
}


Example JSON for an invalid or unrelated resume:
{
  "valid_resume": false,
  "overall_score": 0,
  "overall_rating": "N/A",
  "breakdown": {},
  "improvement_suggestions": [],
  "notes": "Not a valid resume."
}

Evaluation Criteria:
- Compare resume content with the job_role and candidate_type.
- Score each section individually (0-100) and provide an overall score.
- Provide an overall rating based on the score.
- Suggest improvements such as missing skills, frameworks, projects, certifications, or formatting issues.
- Detect gaps, inconsistencies, or irrelevant content if possible.

Instructions:
- Always return a valid JSON following the structure above.
- Never output text outside JSON.
- Be concise, objective, and precise.
- I want the output as a JSON object which is divided in to sections as shown in the example and I dont want any escape sequence characters.
- Output raw JSON only.

Never output text outside JSON.
If the resume mentions relevant titles or references such as LinkedIn, GitHub, portfolio, or project names, treat them as hyperlinks even if the actual URL is missing. Do not mark the contact section as incomplete solely due to missing URLs when the titles indicate the presence of a link.
Be concise, objective, and precise.
`;

app.get("/", (req, res) => {
  res.send("Hello E");
});

app.post("/chatwithgemini", upload.single("pdf"), async (req, res) => {
  let { job_description, candidate_type } = req.body;
  if (!job_description){
    job_description = "No job description provided. Evaluate the resume independently without JD matching"
  }
  if (!candidate_type){
    candidate_type = "Fresher"
  }
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Missing PDF file." });
    }

    const buffer = fs.readFileSync(req.file.path);
    const pdfData = await pdfParse(buffer);
    const noQuotesText = pdfData.text.replace(/["']/g, "");
    fs.unlinkSync(req.file.path); // Clean up uploaded file

    const prompt = `${instructions}
    
    ---
    EVALUATION CONTEXT:
    job_role: "${job_description}"
    candidate_type: "${candidate_type}"
    ---
    RESUME CONTENT:
    ${noQuotesText}
    `

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash", 
      contents: prompt,
    });

    // The raw text from Gemini might be wrapped in ```json ... ```
    const rawText = response.text;
    // console.log("Raw response from Gemini:", rawText);

    let jsonResponse;

    try {
      const match = rawText.match(/```json\s*([\s\S]*?)\s*```/);

      // If a match is found, use the captured group (the clean JSON).
      const textToParse = match ? match[1] : rawText;

      jsonResponse = JSON.parse(textToParse);
    } catch (err) {
      // If parsing fails even after cleaning, then the output is truly invalid.
      return res.status(500).json({
        valid_resume: false,
        error: "Gemini did not return valid JSON, even after cleaning.",
        raw_output: rawText,
      });
    }

    res.json(jsonResponse);
  } catch (error) {
    console.error("Error occurred while querying Gemini:", error);
    res
      .status(500)
      .json({ error: "An error occurred while processing your request." });
  }
});

app.listen(port, () => {
  console.log(`✅ Server is running on http://localhost:${port}`);
});
