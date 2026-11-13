// Display names and links for the two public datasets the samples come from.
export const DATASETS: Record<string, { name: string; url: string }> = {
  FracAtlas: {
    name: "FracAtlas",
    url: "https://www.kaggle.com/datasets/anandhuh/fracatlas",
  },
  BoneFX: {
    name: "Bone Fracture Multi-Region",
    url: "https://www.kaggle.com/datasets/bmadushanirodrigo/fracture-multi-region-x-ray-data",
  },
};

export const datasetName = (source?: string) => (source && DATASETS[source]?.name) || source || "";
