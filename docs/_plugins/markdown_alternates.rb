# Publishes a clean Markdown representation beside every public documentation
# page. Jekyll renders source Markdown as HTML by default, so source files are
# otherwise not available at their documented `.md` URLs after deployment.
#
# The files are written in a `:post_write` hook, NOT a generator: anything
# written into the destination during `generate` is deleted by Jekyll's
# cleaner before the site is written, so a generator here silently produces
# nothing (and every alternate link 404s).
require "fileutils"
require "json"

module Jekyll
  module MarkdownAlternateFilter
    # Must mirror MarkdownAlternates#markdown_path_for below — the <link>
    # emitted by the layout has to point at the file the hook writes.
    def markdown_alternate_url(url)
      return "/index.md" if url == "/"

      path = url.sub(/index\.html$/, "").sub(/\.html$/, "")
      "#{path.sub(%r{/$}, "")}.md"
    end
  end

  module MarkdownAlternates
    EXCLUDED_PATHS = %w[404.html llms.txt llms-full.txt robots.txt sitemap.xml].freeze

    def self.write_all(site)
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

    def self.canonical_path_for(page)
      path = page.url.sub(/index\.html$/, "").sub(/\.html$/, "")
      path.end_with?("/") || path == "/" ? path : path
    end

    def self.markdown_path_for(page, canonical_path)
      return "index.md" if canonical_path == "/"
      return "#{canonical_path.sub(%r{/$}, "")}.md" if page.name == "index.md"

      "#{canonical_path.sub(%r{/$}, "")}.md"
    end

    def self.standalone_markdown(site, page, canonical_path, markdown_path)
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

    def self.write(site, output_path, content)
      destination = site.in_dest_dir(output_path.sub(%r{\A/}, ""))
      FileUtils.mkdir_p(File.dirname(destination))
      File.write(destination, content)
    end
  end
end

Jekyll::Hooks.register :site, :post_write do |site|
  Jekyll::MarkdownAlternates.write_all(site)
end

Liquid::Template.register_filter(Jekyll::MarkdownAlternateFilter)
