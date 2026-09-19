export type DemoJobFixture = {
  id: string;
  title: string;
  company: string;
  location: string;
  workplaceType: "REMOTE" | "HYBRID" | "ONSITE";
  employmentType: "FULL_TIME" | "CONTRACT" | "FIXED_TERM";
  seniority: "MID" | "SENIOR";
  salaryMin: number;
  salaryMax: number;
  salaryCurrency: string;
  requiredSkills: string[];
  preferredSkills: string[];
  description: string;
};

/**
 * A small, self-hosted "job board" the browser worker actually navigates
 * with real Playwright, real screenshots and real DOM extraction. It never
 * touches a live third-party site: SEEK, LinkedIn and Indeed all invest
 * heavily in anti-bot controls, and docs/security.md is explicit about not
 * evading those. Wiring a real source is a reviewed, operator-side decision
 * (docs/data-apis.md's rollout plan) made in `sourceRegistry.ts`, not
 * something this build does by default.
 */
export const DEMO_JOBS: DemoJobFixture[] = [
  {
    id: "applied-ai-engineer",
    title: "Applied AI Engineer",
    company: "Acme Analytics",
    location: "Melbourne, Australia",
    workplaceType: "HYBRID",
    employmentType: "CONTRACT",
    seniority: "SENIOR",
    salaryMin: 150000,
    salaryMax: 180000,
    salaryCurrency: "AUD",
    requiredSkills: ["python", "machine learning", "mlops"],
    preferredSkills: ["bigquery", "docker"],
    description:
      "Acme Analytics is hiring an Applied AI Engineer to design and ship machine learning pipelines integrated with our BigQuery data warehouse. You will own model serving, MLOps tooling and production monitoring for applied ML systems built in Python and Docker.",
  },
  {
    id: "data-scientist",
    title: "Data Scientist",
    company: "DataWorks",
    location: "Remote (Australia)",
    workplaceType: "REMOTE",
    employmentType: "FULL_TIME",
    seniority: "MID",
    salaryMin: 130000,
    salaryMax: 155000,
    salaryCurrency: "AUD",
    requiredSkills: ["python", "sql", "machine learning"],
    preferredSkills: ["data modeling"],
    description:
      "DataWorks is looking for a Data Scientist to build predictive models and warehouse-backed analytics. Strong SQL and Python skills required, with hands-on machine learning experience across the full model lifecycle.",
  },
  {
    id: "frontend-engineer",
    title: "Frontend Engineer",
    company: "PixelCraft",
    location: "Melbourne, Australia",
    workplaceType: "HYBRID",
    employmentType: "CONTRACT",
    seniority: "MID",
    salaryMin: 120000,
    salaryMax: 145000,
    salaryCurrency: "AUD",
    requiredSkills: ["react", "typescript"],
    preferredSkills: ["next.js", "tailwind css"],
    description:
      "PixelCraft needs a Frontend Engineer to build data-heavy dashboards in React and TypeScript. Experience with Next.js and component-driven design systems is a plus.",
  },
  {
    id: "automation-engineer",
    title: "Automation Engineer",
    company: "CloudOps",
    location: "Remote (Australia)",
    workplaceType: "REMOTE",
    employmentType: "FIXED_TERM",
    seniority: "MID",
    salaryMin: 125000,
    salaryMax: 150000,
    salaryCurrency: "AUD",
    requiredSkills: ["python", "airflow", "dbt"],
    preferredSkills: ["bigquery", "github actions"],
    description:
      "CloudOps is automating manual reporting workflows into scheduled ELT pipelines. We need an Automation Engineer fluent in Python, Airflow and dbt with a strong data-quality mindset.",
  },
  {
    id: "senior-business-development-manager",
    title: "Senior Business Development Manager",
    company: "SalesForce Partners",
    location: "Sydney, Australia",
    workplaceType: "ONSITE",
    employmentType: "FULL_TIME",
    seniority: "SENIOR",
    salaryMin: 140000,
    salaryMax: 160000,
    salaryCurrency: "AUD",
    requiredSkills: ["b2b sales", "account management"],
    preferredSkills: [],
    description:
      "SalesForce Partners is hiring a Senior Business Development Manager to drive new-business sales pipeline and manage enterprise accounts across ANZ.",
  },
  {
    id: "senior-java-backend-engineer",
    title: "Senior Java Backend Engineer",
    company: "FinCore",
    location: "Melbourne, Australia",
    workplaceType: "ONSITE",
    employmentType: "FULL_TIME",
    seniority: "SENIOR",
    salaryMin: 160000,
    salaryMax: 190000,
    salaryCurrency: "AUD",
    requiredSkills: ["java", "spring boot", "kafka"],
    preferredSkills: ["kubernetes"],
    description:
      "FinCore's core trading platform team needs a Senior Java Backend Engineer with deep Spring Boot and Kafka experience to build low-latency transaction processing services.",
  },
];
