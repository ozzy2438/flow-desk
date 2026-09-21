import { ResearchComposer } from "@/components/ResearchComposer";

export default function HomePage() {
  return (
    <div className="research-home">
      <section className="w-full max-w-[760px]">
        <h1>Grab any flow from the web</h1>
        <ResearchComposer />
      </section>
    </div>
  );
}
