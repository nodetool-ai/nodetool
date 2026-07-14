# Publishes a clean Markdown representation beside every public documentation
# page. Jekyll renders source Markdown as HTML by default, so source files are
# otherwise not available at their documented `.md` URLs after deployment.
require "fileutils"
require "json"

module Jekyll
  module MarkdownAlternateFilter
    def markdown_alternate_url(url)
      return "/index.md" if url == "/"

      "#{url.sub(%r{/$}, "")}.md"
    end
  end

  class MarkdownAlternates < Generator
    safe true
    priority :low

    EXCLUDED_PATHS = %w[404.html llms.txt llms-full.txt robots.txt sitemap.xml].freeze

    def generate(site)
      site.pages.each do |page|
        next unless page.path.end_with?(".md")
        next if page.data["layout"] == "redirect" || EXCLUDED_PATHS.include?(page.path)

        canonical_path = canonical_path_for(page)
        markdown_path = markdown_path_for(page, canonical_path)
        content = standalone_markdown(site, page, canonical_path, markdown_path)
        write(site, markdown_path, content)

        if page.name == "index.md" && canonical_path != "/"
          write(site, "#{canonical_path.sub(%r{/$}, "")}/index.md", content)
        end
      end
    end

    private

    def canonical_path_for(page)
      path = page.url.sub(/index\.html$/, "").sub(/\.html$/, "")
      path.end_with?("/") || path == "/" ? path : path
    end

    def markdown_path_for(page, canonical_path)
      return "index.md" if canonical_path == "/"
      return "#{canonical_path.sub(%r{/$}, "")}.md" if page.name == "index.md"

      "#{canonical_path}.md"
    end

    def standalone_markdown(site, page, canonical_path, markdown_path)
      source = File.read(page.path, encoding: "UTF-8")
      body = source.sub(/\A---\s*\n.*?\n---\s*\n/m, "").strip
      title = page.data["title"] || page.name.sub(/\.md$/, "").tr("-", " ")
      description = page.data["description"] || site.config["description"]
      canonical = "#{site.config["url"]}#{canonical_path}"
      markdown = "#{site.config["url"]}/#{markdown_path.sub(%r{\A/}, "")}".gsub(%r{(?<!:)//}, "/")

      [
        "---",
        "title: #{title.to_json}",
        "description: #{description.to_json}",
        "canonical: #{canonical}",
        "markdown: #{markdown}",
        "product: NodeTool",
        "source: https://github.com/nodetool-ai/nodetool/blob/main/docs/#{page.path}",
        "---",
        "",
        "# #{title}",
        "",
        body,
        "",
      ].join("\n")
    end

    def write(site, output_path, content)
      destination = site.in_dest_dir(output_path.sub(%r{\A/}, ""))
      FileUtils.mkdir_p(File.dirname(destination))
      File.write(destination, content)
    end
  end
end

Liquid::Template.register_filter(Jekyll::MarkdownAlternateFilter)
