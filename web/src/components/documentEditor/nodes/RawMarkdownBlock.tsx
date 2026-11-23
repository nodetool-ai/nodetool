import { memo } from "react";
import { useTranslation } from "react-i18next";

import { CodeBlock } from "../../ui_primitives";

interface RawMarkdownBlockProps {
  markdown: string;
}

/** The face of a {@link RawMarkdownNode}: its source, edited in the source view. */
const RawMarkdownBlock = ({ markdown }: RawMarkdownBlockProps) => {
  const { t } = useTranslation();
  return (
    <CodeBlock language={t("documentEditor.rawBlockLabel")} wrap={false}>
      {markdown}
    </CodeBlock>
  );
};

export default memo(RawMarkdownBlock);
