/**
 * Embeddings for semantic search, provider-abstracted. Voyage AI is the
 * default implementation (plain fetch, no SDK). When no key is configured,
 * search degrades to lexical scoring — documented, not silent.
 */

export const EMBEDDING_DIMENSIONS = 1024;

export interface EmbeddingsProvider {
  readonly available: boolean;
  /** Embed documents for storage. */
  embedDocuments(texts: string[]): Promise<number[][]>;
  /** Embed a query (some providers use asymmetric encodings). */
  embedQuery(text: string): Promise<number[]>;
}

export class VoyageEmbeddings implements EmbeddingsProvider {
  readonly available = true;
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = "voyage-3.5-lite") {
    this.apiKey = apiKey;
    this.model = model;
  }

  private async embed(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
    const response = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        input_type: inputType,
        output_dimension: EMBEDDING_DIMENSIONS,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Voyage embeddings failed (${response.status}): ${body.slice(0, 300)}`);
    }
    const json = (await response.json()) as { data: { index: number; embedding: number[] }[] };
    return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }

  embedDocuments(texts: string[]): Promise<number[][]> {
    return this.embed(texts, "document");
  }

  async embedQuery(text: string): Promise<number[]> {
    const [vector] = await this.embed([text], "query");
    return vector!;
  }
}

export class NullEmbeddings implements EmbeddingsProvider {
  readonly available = false;
  embedDocuments(): Promise<number[][]> {
    return Promise.reject(new Error("Embeddings are not configured."));
  }
  embedQuery(): Promise<number[]> {
    return Promise.reject(new Error("Embeddings are not configured."));
  }
}

export function createEmbeddings(env: { VOYAGE_API_KEY?: string }): EmbeddingsProvider {
  return env.VOYAGE_API_KEY ? new VoyageEmbeddings(env.VOYAGE_API_KEY) : new NullEmbeddings();
}
