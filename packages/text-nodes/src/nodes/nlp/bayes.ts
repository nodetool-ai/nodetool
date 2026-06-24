/**
 * Multinomial-style naive Bayes classifier, ported verbatim from the `natural`
 * package's `BayesClassifier` (classifiers/classifier.js +
 * classifiers/bayes_classifier.js) and the underlying `apparatus`
 * `BayesClassifier` it delegates to (both MIT).
 *
 * Tokenization/stemming (PorterStemmer.tokenizeAndStem with stopword removal),
 * the binary feature-vector representation, +1 Laplace smoothing, and the
 * log-probability scoring all match natural so `classify`/`getClassifications`
 * produce identical labels and values.
 */

import { PorterStemmer } from "./porter-stemmer.js";

export interface Classification {
  label: string;
  value: number;
}

interface Stemmer {
  stem(token: string): string;
  tokenizeAndStem(text: string, keepStops?: boolean): string[];
}

/** Port of apparatus' BayesClassifier (operates on binary feature vectors). */
class ApparatusBayesClassifier {
  private classFeatures: Record<string, Record<number, number>> = {};
  private classTotals: Record<string, number> = {};
  private totalExamples = 1; // start at one to smooth
  private readonly smoothing: number;

  constructor(smoothing?: number) {
    this.smoothing = smoothing === undefined ? 1.0 : smoothing;
  }

  addExample(observation: number[], label: string): void {
    if (!this.classFeatures[label]) {
      this.classFeatures[label] = {};
      this.classTotals[label] = 1; // give an extra for smoothing
    }

    let i = observation.length;
    this.totalExamples++;
    this.classTotals[label]++;

    while (i--) {
      if (observation[i]) {
        if (this.classFeatures[label][i]) {
          this.classFeatures[label][i]++;
        } else {
          this.classFeatures[label][i] = 1 + this.smoothing;
        }
      }
    }
  }

  train(): void {
    // apparatus' Bayes classifier trains incrementally via addExample.
  }

  private probabilityOfClass(observation: number[], label: string): number {
    let prob = 0;
    let i = observation.length;

    while (i--) {
      if (observation[i]) {
        const count = this.classFeatures[label][i] || this.smoothing;
        // numbers are tiny, add logs rather than take product
        prob += Math.log(count / this.classTotals[label]);
      }
    }

    // p(C) * unlogging the above calculation P(X|C)
    prob = (this.classTotals[label] / this.totalExamples) * Math.exp(prob);
    return prob;
  }

  getClassifications(observation: number[]): Classification[] {
    const labels: Classification[] = [];
    for (const className in this.classFeatures) {
      labels.push({
        label: className,
        value: this.probabilityOfClass(observation, className)
      });
    }
    return labels.sort((x, y) => y.value - x.value);
  }

  classify(observation: number[]): string {
    const classifications = this.getClassifications(observation);
    if (!classifications || classifications.length === 0) {
      throw new Error("Not Trained");
    }
    return classifications[0].label;
  }
}

/** Port of natural's `BayesClassifier` (the Classifier wrapper). */
export class BayesClassifier {
  private readonly classifier: ApparatusBayesClassifier;
  private readonly stemmer: Stemmer;
  private docs: Array<{ label: string; text: string[] }> = [];
  private features: Record<string, number> = {};
  private lastAdded = 0;
  private keepStops = false;

  constructor(stemmer?: Stemmer, smoothing?: number) {
    this.classifier =
      smoothing !== undefined && isFinite(smoothing)
        ? new ApparatusBayesClassifier(smoothing)
        : new ApparatusBayesClassifier();
    this.stemmer = stemmer ?? PorterStemmer;
  }

  setOptions(options: { keepStops?: boolean }): void {
    this.keepStops = !!options.keepStops;
  }

  addDocument(text: string | string[], classification: string): void {
    if (typeof classification === "undefined") {
      return;
    }
    if (typeof classification === "string") {
      classification = classification.trim();
    }

    let tokens: string[];
    if (typeof text === "string") {
      tokens = this.stemmer.tokenizeAndStem(text, this.keepStops);
    } else {
      tokens = text;
    }

    if (tokens.length === 0) {
      return;
    }

    this.docs.push({ label: classification, text: tokens });

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      this.features[token] = (this.features[token] || 0) + 1;
    }
  }

  private textToFeatures(observation: string | string[]): number[] {
    const features: number[] = [];

    let tokens: string[];
    if (typeof observation === "string") {
      tokens = this.stemmer.tokenizeAndStem(observation, this.keepStops);
    } else {
      tokens = observation;
    }

    for (const feature in this.features) {
      features.push(tokens.indexOf(feature) > -1 ? 1 : 0);
    }

    return features;
  }

  train(): void {
    const totalDocs = this.docs.length;
    for (let i = this.lastAdded; i < totalDocs; i++) {
      const features = this.textToFeatures(this.docs[i].text);
      this.classifier.addExample(features, this.docs[i].label);
      this.lastAdded++;
    }
    this.classifier.train();
  }

  getClassifications(observation: string | string[]): Classification[] {
    return this.classifier.getClassifications(
      this.textToFeatures(observation)
    );
  }

  classify(observation: string | string[]): string {
    return this.classifier.classify(this.textToFeatures(observation));
  }
}
