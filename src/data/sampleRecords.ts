// Test user #1 (Nazim) — real records from his certificates, CFGI transcript and CBA Excel.
// Temporary: replaced by Supabase data once login is built.
import { Record } from "../engine/engine";

export const sampleRecords: Record[] = [
  // CBA Excel (RSM) — "Non-Technical Subject Areas"
  { title: "AI Empowerment Day 1 – RSM AI Fundamentals", provider: "RSM US LLP", date: "2026-03-09", hours: 1.8, fieldOfStudy: "Personal Development" },
  { title: "AI Empowerment Day 2 – Prompt Engineering", provider: "RSM US LLP", date: "2026-03-10", hours: 1.5, fieldOfStudy: "Personal Development" },
  { title: "AI Empowerment Day 3 – Use Case Discovery", provider: "RSM US LLP", date: "2026-03-11", hours: 1.5, fieldOfStudy: "Personal Development" },
  { title: "AI Empowerment Day 4 – AI Process Redesign", provider: "RSM US LLP", date: "2026-03-12", hours: 1.8, fieldOfStudy: "Personal Development" },
  { title: "AI Empowerment Day 5 – Change Management", provider: "RSM US LLP", date: "2026-03-13", hours: 1.8, fieldOfStudy: "Personal Development" },
  // CFGI certificates
  { title: "LA OC Training", provider: "CFGI (137501)", date: "2026-06-16", hours: 5, fieldOfStudy: "Accounting", delivery: "Group Live" },
  { title: "Introduction to Controllership Part II", provider: "CFGI (137501)", date: "2026-06-17", hours: 1, fieldOfStudy: "Accounting", delivery: "Group Internet Based" },
  // CFGI Learn transcript — no field of study printed, assumed non-technical
  { title: "Accelerating Your Career with Personal Branding", provider: "CFGI Learn", date: "2026-06-25", hours: 1.4, fieldOfStudy: "Personal Development", needsReview: true },
  { title: "Building Better Relationships through Listening and Validation", provider: "CFGI Learn", date: "2026-06-25", hours: 0.5, fieldOfStudy: "Personal Development", needsReview: true },
  // Becker certificates
  { title: "10 Habits of Highly Successful Careers", provider: "Becker (107294)", date: "2026-09-24", hours: 2.0, fieldOfStudy: "Personal Development", delivery: "QAS Self Study" },
  { title: "AI for Accountants and Auditors: Deep Prompting Techniques", provider: "Becker (107294)", date: "2026-09-24", hours: 2.5, fieldOfStudy: "Accounting", delivery: "QAS Self Study" },
];
