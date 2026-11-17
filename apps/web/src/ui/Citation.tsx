import { type SourceRef, KNOWLEDGE, citationUrl } from "../knowledge";

export function Citation({ source }: { source: SourceRef }) {
  const document = KNOWLEDGE.documents[source.document];
  return (
    <a className="citation" href={citationUrl(source)} target="_blank" rel="noopener noreferrer">
      {document?.title ?? source.document}, p. {source.page}
    </a>
  );
}
