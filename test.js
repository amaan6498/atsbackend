import express from "express";
import multer from "multer";
import pdfParse from "pdf-parse";
import fs from "fs";

const app = express();
const port = 3000;
const upload = multer({ dest: "uploads/" });

function extractSections(text) {
  let output = {
    title: "",
    skills: [],
    projects: [],
    experience: [],
  };

  // Title: first non-empty line
  const titleMatch = text.match(/^([^\n\r]+)/);
  if (titleMatch) {
    output.title = titleMatch[1].trim();
  }

  // Skills
  const skillsMatch = text.match(/Skills[\s\S]*?(?=\n[A-Z])/i);
  if (skillsMatch) {
    output.skills = skillsMatch[0]
      .replace(/Skills/i, "")
      .trim()
      .split("\n")
      .map(skill => skill.trim())
      .filter(skill => skill);
  }

  // Projects
  const projectsMatch = text.match(/Projects[\s\S]*?(?=\n[A-Z])/i);
  if (projectsMatch) {
    output.projects = projectsMatch[0]
      .replace(/Projects/i, "")
      .trim()
      .split("\n")
      .map(proj => proj.trim())
      .filter(proj => proj);
  }

  // Experience
  const experienceMatch = text.match(/Experience[\s\S]*?(?=\n[A-Z]|$)/i);
  if (experienceMatch) {
    output.experience = experienceMatch[0]
      .replace(/Experience/i, "")
      .trim()
      .split("\n")
      .map(exp => exp.trim())
      .filter(exp => exp);
  }

  return output;
}


app.get("/", (req, res) => {
  res.send("Hello World");
});

app.post("/upload-pdf", upload.single("pdf"), async (req, res) => {
  try {
    // Read uploaded file as Buffer
    const dataBuffer = fs.readFileSync(req.file.path);

    // Parse PDF data
    const pdfData = await pdfParse(dataBuffer);
    const pdfText = pdfData.text;

    const structuredData = extractSections(pdfText);

    // Respond with parsed PDF as JSON
    res.json(structuredData);

    // Optionally remove file after processing
    fs.unlinkSync(req.file.path);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to process PDF" });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
