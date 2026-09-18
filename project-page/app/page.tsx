import { Citation } from "@/components/citation";
import { BrandMark, Icon } from "@/components/icon";
import { PaperFigure } from "@/components/paper-figure";
import { VideoPlayer } from "@/components/video-player";
import { publication } from "@/lib/publication";

const stages = [
  {
    number: "01",
    figureGroup: "A",
    title: "See the population",
    text: "Trace the evolution of ideas. Find promising lineages, emerging strategies, and programs worth a closer look.",
    components: [
      {
        reference: "A1–A2",
        name: "Population Overview & islands",
        description:
          "A radial tree arranges programs by generation and island. Color encodes performance, while parent–child links trace how solutions evolve.",
      },
      {
        reference: "A3–A4",
        name: "Best & noteworthy nodes",
        description:
          "Golden rings identify each island’s best program. Lightbulbs flag noteworthy nodes for expert review.",
      },
      {
        reference: "A5",
        name: "Dissimilarity Chords",
        description:
          "Compare the algorithmic strategies of island-best programs through arcs colored by dissimilarity.",
      },
      {
        reference: "A6",
        name: "Evolution Overview",
        description:
          "Read an LLM-generated summary of explored, promising, and failed strategies across the population.",
      },
      {
        reference: "A7–A8",
        name: "Clusters & Score Distribution",
        description:
          "Find groups with similar reasoning in a scatter plot, then use the score distribution to filter out low-performing programs.",
      },
    ],
  },
  {
    number: "02",
    figureGroup: "B",
    title: "Understand the details",
    text: "Compare programs, inspect their changes, and explore source code with explanations from the Maestro agent.",
    components: [
      {
        reference: "B1",
        name: "Node tooltip & lineage",
        description:
          "Hover to see a program’s score, patch type, and island. Select it to trace its lineage back to the initial seed.",
      },
      {
        reference: "B2",
        name: "Node Details",
        description:
          "Inspect the patch description, performance, metadata, parents, and inspirations. Prompt, Evaluation, and Execution tabs provide further context.",
      },
      {
        reference: "B3",
        name: "Code & Code Diff",
        description:
          "Read a program or compare two versions side by side. Maestro Chat explains their strategies and anchors its explanations to specific lines of code.",
      },
      {
        reference: "B4",
        name: "Comparison Panel",
        description:
          "Compare selected programs’ performance and reasoning-based dissimilarity to identify both strong solutions and complementary ideas.",
      },
    ],
  },
  {
    number: "03",
    figureGroup: "C",
    title: "Shape what comes next",
    text: "Suggest a direction, merge complementary ideas, or prune a dead end. Then let evolution continue.",
    components: [
      {
        reference: "C1",
        name: "Suggest",
        description:
          "Open a node’s context menu and write natural-language guidance, with an AI-generated recommendation as a starting point. The guidance produces a new child program.",
      },
      {
        reference: "C1",
        name: "Merge",
        description:
          "Combine ideas from two programs. Recommended partners are ranked by performance and dissimilarity to help you find complementary strategies.",
      },
      {
        reference: "C1",
        name: "Ban, Mark & Note",
        description:
          "Exclude an unproductive node from future parent selection, bookmark a promising one, or attach a note to preserve your observations.",
      },
      {
        reference: "C2",
        name: "Run Control",
        description:
          "Control the pace of evolution: Start continuous evolution, Pause and Continue it, or use Step to generate one node before reviewing the results.",
      },
    ],
  },
];

const frameworkAdditions = [
  {
    reference: "① Population Database",
    title: "Prune unproductive directions",
    description:
      "Ban excludes a node from future parent selection. Experts can stop the search from repeatedly building on a strategy they judge unproductive.",
  },
  {
    reference: "②–③ Parent Selection & Node Generation",
    title: "Choose parents and guide their changes",
    description:
      "Suggest refines a selected parent using natural-language guidance. Merge combines two selected programs, with optional instructions about which ideas to bring together.",
  },
  {
    reference: "④ Node Evaluation",
    title: "Compare the ideas behind the code",
    description:
      "Alongside evaluation scores, reasoning-based embeddings represent each node’s patch description and reasoning. They support strategy comparisons through clusters and dissimilarity views.",
  },
  {
    reference: "⑤ Expert Review Prioritization · New stage",
    title: "Bring noteworthy nodes to attention",
    description:
      "A default or expert-customized function flags nodes for inspection using scores and embeddings. These flags guide human attention; they do not change scores, reject candidates, or determine parent selection.",
  },
  {
    reference: "Across the loop · Pacing Control",
    title: "Make time for judgment",
    description:
      "Start continuous evolution, Pause to review the results, and Continue when ready. Use Step to generate one node at a time before deciding what to try next.",
  },
  {
    reference: "Alongside the loop · Maestro Agent",
    title: "Understand before intervening",
    description:
      "The agent reads the population to explain code, compare programs, and identify patterns. Conversational explanations and line-level annotations help experts ground their steering decisions in the programs themselves.",
  },
];

const requirementGroups = [
  {
    title: "Information overload",
    requirements: [
      {
        id: "DR1",
        title: "Surface algorithmic intent of node generation",
        description:
          "Make the idea behind each node immediately visible and easy to scan, alongside its code and score.",
      },
      {
        id: "DR2",
        title: "Support multi-level comparison between nodes",
        description:
          "Enable comparisons of performance, code changes, and algorithmic strategies, including across islands.",
      },
      {
        id: "DR3",
        title: "Provide population-level overviews",
        description:
          "Aggregate individual nodes into a global picture of explored directions, promising programs, and search progress.",
      },
      {
        id: "DR4",
        title: "Prioritize decision-relevant information",
        description:
          "Highlight nodes that merit attention and let experts customize what counts as noteworthy, such as performance jumps or novel strategies.",
      },
    ],
  },
  {
    title: "Lack of human-in-the-loop interaction",
    requirements: [
      {
        id: "DR5",
        title: "Enable targeted expert intervention",
        description:
          "Let experts guide mutations, combine ideas from multiple nodes, and shape which lineages continue evolving.",
      },
      {
        id: "DR6",
        title: "Support flexible evolution pacing",
        description:
          "Support passive monitoring, throttled observation, and step-by-step control, with the freedom to shift between them as needs change.",
      },
    ],
  },
];

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="container header-inner">
          <a className="wordmark" href="#top" aria-label="EvoMaestro home">
            <BrandMark />
            <span>EvoMaestro</span>
          </a>
          <nav aria-label="Main navigation">
            <a href="#video">Video</a>
            <a href="#overview">Overview</a>
            <a href="#research">Research</a>
            <a
              className="nav-code"
              href={publication.codeUrl}
              target="_blank"
              rel="noreferrer"
            >
              Code <Icon name="arrowUpRight" />
            </a>
          </nav>
        </div>
      </header>
      <main id="main">
        <section
          className="hero container"
          id="top"
          aria-labelledby="paper-title"
        >
          <div className="publication-label">
            <span className="venue">UIST ’26</span>
          </div>
          <h1 id="paper-title">
            <span className="hero-name">
              Evo<span>Maestro</span>
            </span>
            <span className="sr-only">: </span>
            <span className="hero-title">
              Toward Interpretable and Steerable
              <br className="desktop-break" />{" "}
              <span className="no-wrap">LLM-Driven</span> Program Evolution
            </span>
          </h1>
          <div className="authors">
            {publication.authors.map((author) => (
              <span key={author.name}>
                {author.name}
                <sup>{author.affiliation}</sup>
              </span>
            ))}
          </div>
          <div className="affiliations">
            <span>
              <sup>1</sup> Nanyang Technological University
            </span>
            <span>
              <sup>2</sup> Tsinghua University
            </span>
          </div>
          <div className="hero-actions">
            <a
              className="button button-primary"
              href={publication.paperUrl}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="paper" /> Read the paper
            </a>
            <a
              className="button button-secondary"
              href={publication.codeUrl}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="code" /> Source code
            </a>
            <a
              className="button button-secondary"
              href={publication.demoUrl.href}
              target="_blank"
              rel="noreferrer"
            >
              Online demo
            </a>
          </div>
          <div className="hero-video" id="video">
            <VideoPlayer />
          </div>
          <p className="hero-note">
            A human perspective on an evolving world of programs.
          </p>
        </section>
        <section
          className="container overview"
          id="overview"
          aria-label="System overview"
        >
          <PaperFigure
            number={1}
            src="/figures/interface.webp"
            width={3200}
            height={1381}
            label="The EvoMaestro interface"
            alt="Annotated EvoMaestro interface: a radial tree shows program lineages and performance, with coordinated views for strategy summaries, code comparison, and Suggest, Merge, and Ban interventions."
          >
            The EvoMaestro interface supports LLM-driven program evolution
            through three stages: (A) <em>Evolution Understanding</em> overviews
            the population structure, performance, and strategies (A1-A8); (B){" "}
            <em>Node Understanding</em> enables multi-level inspection of
            individual nodes, including metadata (B1, B2), code explanations
            (B3), and comparison (B4); and (C) <em>Evolution Steering</em>{" "}
            allows interactive interventions such as <em>Suggest</em>,{" "}
            <em>Merge</em>, <em>Ban</em>, and <em>pacing control</em> of the
            evolution process.
          </PaperFigure>
          <div className="stages">
            {stages.map((stage) => (
              <article className="stage" key={stage.number}>
                <span className="stage-number">
                  {stage.number} · Figure 1{stage.figureGroup}
                </span>
                <h2>{stage.title}</h2>
                <p>{stage.text}</p>
                <dl className="stage-components">
                  {stage.components.map((component) => (
                    <div key={component.name}>
                      <dt>
                        <span className="figure-reference">
                          {component.reference}
                        </span>
                        {component.name}
                      </dt>
                      <dd>{component.description}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
        </section>
        <section
          className="container story section-space"
          aria-labelledby="story-title"
        >
          <div>
            <p className="eyebrow">THE IDEA</p>
            <h2 className="section-title" id="story-title">
              Expert insight.
              <br /> <em>Inside the loop.</em>
            </h2>
          </div>
          <div className="story-copy">
            <p className="lead">
              LLMs can evolve remarkable programs. But as the population grows,
              how do we understand the ideas taking shape, and decide where to
              go next?
            </p>
            <p>
              EvoMaestro brings expert judgment into program evolution. It
              connects a visual overview of the population with close inspection
              of individual programs, then turns that understanding into
              concrete interventions.
            </p>
            <p>
              We call this <strong>semantic oversight</strong>: understanding
              and steering populations of evolving algorithmic ideas.
            </p>
          </div>
        </section>
        <section
          className="container section-space framework"
          id="framework"
          aria-labelledby="framework-title"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">THE FRAMEWORK</p>
              <h2 className="section-title" id="framework-title">
                From automatic evolution
                <br />
                to expert steering.
              </h2>
            </div>
            <p>
              Standard LLM-driven program evolution repeats four stages:
              maintain a population of candidate programs (①), select parents
              (②), ask an LLM to modify or combine them (③), and execute and
              score the new programs (④). Evaluated candidates return to the
              population, providing starting points for later generations.
            </p>
          </div>
          <PaperFigure
            number={2}
            src="/figures/framework.webp"
            width={2600}
            height={992}
            label="Steerable program evolution"
            alt="The standard four-stage loop flows from Population Database through Parent Selection, Node Generation, and Node Evaluation. EvoMaestro adds Expert Review Prioritization as stage 5 in both rows. The top row shows expert selection, guidance, banning, and pacing; the bottom row runs automatically. The interface connects these intervention and feedback channels, while the Maestro Agent supports interpretation across both rows."
          >
            <strong>Steerable Program Evolution Framework.</strong> Stages ①–④
            correspond to the standard loop (§3); ⑤ is added by EvoMaestro. The
            steerable loop (Top) extends the automatic loop (Bottom) with Ban,
            Merge, Suggest, Expert Review Prioritization, and Pacing Control.
            The Maestro Agent (left) provides conversational code explanation
            and annotation.
          </PaperFigure>
          <section
            className="framework-additions"
            aria-labelledby="framework-additions-title"
          >
            <div className="framework-additions-intro">
              <h3 id="framework-additions-title">What EvoMaestro adds</h3>
              <p>
                Both rows include our new review stage (⑤). The top row exposes
                expert intervention points, while the bottom row keeps parent
                selection and generation automatic. The interface connects these
                controls with scores, evolution information, and noteworthy
                nodes, so observations can inform the next intervention.
              </p>
            </div>
            <dl className="framework-additions-list">
              {frameworkAdditions.map((addition) => (
                <div key={addition.reference}>
                  <dt>
                    <span>{addition.reference}</span>
                    {addition.title}
                  </dt>
                  <dd>{addition.description}</dd>
                </div>
              ))}
            </dl>
          </section>
        </section>
        <section
          className="research-section"
          id="research"
          aria-labelledby="research-title"
        >
          <div className="container">
            <div className="section-heading">
              <div>
                <p className="eyebrow">THE RESEARCH</p>
                <h2 className="section-title" id="research-title">
                  Built with experts.
                  <br />
                  <em>Studied with people.</em>
                </h2>
              </div>
              <p>
                A formative study shaped the design. A controlled user study
                examined understanding, workload, and support for steering.
              </p>
            </div>
            <div className="study-grid">
              <div className="study-item">
                <span className="study-value">8</span>
                <h3>Domain experts</h3>
                <p>
                  In the formative study, informing six design requirements.
                </p>
              </div>
              <div className="study-item">
                <span className="study-value">12</span>
                <h3>Study participants</h3>
                <p>
                  In a within-subjects comparison with the ShinkaEvolve
                  interface.
                </p>
              </div>
              <div className="study-item">
                <span className="study-value">
                  7<span> days</span>
                </span>
                <h3>System demonstration</h3>
                <p>
                  Following a domain-expert co-author through a routing
                  optimization task.
                </p>
              </div>
            </div>
            <section
              className="design-requirements"
              aria-labelledby="requirements-title"
            >
              <div className="requirements-intro">
                <h3 id="requirements-title">Design requirements</h3>
                <p>
                  The formative study revealed six requirements, organized
                  around two recurring problems: understanding an evolving
                  population and having the means to steer it.
                </p>
              </div>
              {requirementGroups.map((group) => (
                <div className="requirement-group" key={group.title}>
                  <h4>{group.title}</h4>
                  <ul className="requirements-list">
                    {group.requirements.map((requirement) => (
                      <li key={requirement.id}>
                        <span className="requirement-id">{requirement.id}</span>
                        <h5>{requirement.title}</h5>
                        <p>{requirement.description}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
            <div className="research-finding">
              <p>
                In the controlled user study, participants reported{" "}
                <strong>clearer understanding</strong> and{" "}
                <strong>lower cognitive workload</strong> compared with the
                baseline.
              </p>
              <a
                className="text-link"
                href={publication.paperUrl}
                target="_blank"
                rel="noreferrer"
              >
                Explore the findings <Icon name="arrowRight" />
              </a>
            </div>
          </div>
        </section>
        <section
          className="container citation-section section-space"
          id="citation"
          aria-labelledby="citation-title"
        >
          <div className="citation-intro">
            <p className="eyebrow">REFERENCE</p>
            <h2 className="section-title" id="citation-title">
              Build on
              <br /> <em>this work.</em>
            </h2>
            <p>
              If EvoMaestro informs your research, please consider citing our
              paper.
            </p>
            <a
              className="text-link"
              href={publication.codeUrl}
              target="_blank"
              rel="noreferrer"
            >
              Explore the code <Icon name="arrowUpRight" />
            </a>
          </div>
          <Citation />
        </section>
      </main>
      <footer className="container site-footer">
        <a className="wordmark" href="#top">
          <BrandMark />
          <span>EvoMaestro</span>
        </a>
      </footer>
    </>
  );
}
