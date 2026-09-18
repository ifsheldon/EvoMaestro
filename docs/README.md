# Documentation

[English](README.md) | [简体中文](README.zh-CN.md)

Start with the [project README](../README.md) for installation and the [dataset guide](../datasets/README.md) for the bundled examples.
Run command examples from the working directory specified in their guide.

## Guides

- [Docker hosting](../docker/README.md): one container for the public mock demo, project page, and recorded-run Shinka viewers, with host cloudflared origins.
- [Mock examples and guided walkthrough](guides/mock-examples.md): run or resume the demo, prepare fixtures, understand the fixed guide, and configure same-origin hosting.
- [Interface development guide](../evomaestro-interface/README.md): frontend and backend setup, commands, and checks.
- [Publication website](../project-page/README.md): maintain and build the project page.

## Architecture

- [ShinkaEvolve integration](architecture/shinka-evolve.md): evolution runners, storage, human steering, checkpoints, and completion accounting.
- [Reasoning embeddings](architecture/reasoning-embeddings.md): eligibility, similarity, projections, and offline repair workflows.
- [Interface architecture](../evomaestro-interface/architecture.md): views, guide lifecycle, chat, and backend integration.

## Benchmarks

- [Drone path optimization (MOP)](benchmarks/drone-path-optimization.md): inputs, outputs, constraints, and scoring.
- [Graph multi-objective routing (GraphMOP)](benchmarks/graph-mop.md): routing, server assignment, latency, and energy objectives.
- [Bundled datasets](../datasets/README.md): harness locations, recorded runs, and working-copy instructions.

## Maintenance

- [Documentation rules](AGENTS.md): placement, sources of truth, translations, and link checks.

## Reference papers

These third-party materials retain their original authorship and notices and are not covered by EvoMaestro's MIT license.

- AlphaEvolve: [extracted text](reference-papers/alpha-evolve/AlphaEvolve.md) · [original PDF](reference-papers/alpha-evolve/AlphaEvolve_origin.pdf).
- ShinkaEvolve: [extracted text](reference-papers/shinka-evolve/shinka_evolve.md) · [original PDF](reference-papers/shinka-evolve/shinka_evolve_origin.pdf).
