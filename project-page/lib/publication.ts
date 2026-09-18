export const publication = {
  name: "EvoMaestro",
  title:
    "EvoMaestro: Toward Interpretable and Steerable LLM-Driven Program Evolution",
  description:
    "An interactive visual analytics system that helps experts understand, inspect, and steer LLM-driven program evolution.",
  paperUrl:
    "https://www.researchgate.net/publication/414382819_EvoMaestro_Toward_Interpretable_and_Steerable_LLM-Driven_Program_Evolution",
  codeUrl: "https://github.com/ifsheldon/EvoMaestro",
  demoUrl: new URL("https://evomaestro-demo.reify.ing"),
  videoEmbedUrl:
    "https://www.youtube-nocookie.com/embed/zKSLpQSU0iY?autoplay=1&rel=0",
  authors: [
    { name: "Feng Liang", affiliation: 1 },
    { name: "Sizhe Cheng", affiliation: 1 },
    { name: "Yikai Li", affiliation: 1 },
    { name: "Ruijie He", affiliation: 2 },
    { name: "Xiaolin Wen", affiliation: 1 },
    { name: "Yong Wang", affiliation: 1 },
  ],
} as const;

export const citation = `@inproceedings{liang2026evomaestro,
  author    = {Liang, Feng and Cheng, Sizhe and Li, Yikai and
               He, Ruijie and Wen, Xiaolin and Wang, Yong},
  title     = {{EvoMaestro}: Toward Interpretable and Steerable
               {LLM}-Driven Program Evolution},
  booktitle = {The 39th Annual ACM Symposium on User Interface
               Software and Technology},
  series    = {UIST '26},
  year      = {2026},
  doi       = {10.1145/3830398.3830626}
}`;
