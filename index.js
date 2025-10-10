import express from "express";
import multer from "multer";
import fs from "fs";
import pdfParse from "pdf-parse";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { GoogleGenAI } from "@google/genai";
import { log } from "console";

dotenv.config();

const app = express();
const port = 5000;
app.use(express.json());
const ai = new GoogleGenAI({
  apiKey: "AIzaSyBaGBo7Sh8eaXWX1NjI2qZi7xc-DKlOwi4",
});

const HF_API_KEY = process.env.HF_API_KEY;
const MODEL = "openai/gpt-oss-20b:fireworks-ai";

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

// Root route
app.get("/", (req, res) => {
  res.send("Hello E");
});

app.post("/chatwithgemini", async (req, res) => {
  const userInput = req.body.text; // <-- Extract the text property
  console.log("User Input:", userInput);
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: `${instructions} : 

      ${userInput}`,
    });

    // Try to parse Gemini's response as JSON
    let jsonResponse;
    try {
      console.log("Json Obj :", response.text);
      jsonResponse = JSON.parse(response.text);
    } catch (err) {
      // If not valid JSON, return error and raw output
      return res.status(200).json({
        valid_resume: false,
        error: "Gemini did not return valid JSON.",
        raw_output: response.text,
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

// PDF upload and scoring route
app.post("/getScore", upload.single("pdf"), async (req, res) => {
  try {
    const pdfBuffer = fs.readFileSync(req.file.path);
    const pdfData = await pdfParse(pdfBuffer);

    const resumeText = pdfData.text;
    console.log("Extracted Resume Text:", resumeText);
    // Format as a single-line JSON string for AI input
    const userMessage = JSON.stringify({
      resume: resumeText,
      job_role: "Core Java Developer",
      candidate_type: "Fresher",
    });
    log(userMessage);
    const responseJson = await generateResponse(userMessage);
    console.log(responseJson);

    fs.unlinkSync(req.file.path); // Clean up uploaded file

    // Send JSON output
    res.json(responseJson);
  } catch (error) {
    console.error("Error during resume evaluation:", error);
    res.status(500).json({ error: "Failed to process resume" });
  }
});

// Function to call Hugging Face inference endpoint
async function generateResponse(userMessage) {
  try {
    const response = await fetch(
      "https://router.huggingface.co/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HF_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: instructions },
            { role: "user", content: userMessage },
          ],
        }),
      }
    );

    const data = await response.json();

    const content = data?.choices?.[0]?.message?.content;

    // Always return valid JSON or fallback to empty structure
    try {
      return JSON.parse(content);
    } catch (parseErr) {
      return {
        valid_resume: false,
        error: "Model returned non-JSON response",
        raw_output: content,
      };
    }
  } catch (err) {
    console.error("Error calling HF API:", err);
    return {
      valid_resume: false,
      error: "Failed to connect to evaluation API",
    };
  }
}

// Start server
app.listen(port, () => {
  console.log(`✅ Server is running on http://localhost:${port}`);
});
