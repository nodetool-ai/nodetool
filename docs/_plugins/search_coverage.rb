# Keeps the published site consistent with what Search Console should index.
# The 2026-10-22 coverage export for docs.nodetool.ai traced most of its
# "not indexed" rows to signals the site itself sent:
#
# - sitemap.xml listed every redirect stub and every page whose canonical is
#   on nodetool.ai, so Google was asked to index URLs that tell it not to.
# - Every page's canonical is its `.html` URL, but the sidebar, header,
#   footer and many bodies linked the extensionless form, so most internal
#   links pointed at an alternate of the page instead of the page.
# - Generated node reference pages had no description of their own, so
#   600 pages shared the site description, and nodes with the same title in
#   different namespaces shared a <title>.
# - Node pages that moved namespace had no redirect, so they returned 404.
#
# Moved pages live in _data/moved_pages.yml. Add an entry only when the old
# page has a real successor; a removed node with no replacement should 404.
require "pathname"

module Jekyll
  module SearchCoverage
    SITE_URL = "https://docs.nodetool.ai".freeze
    DESCRIPTION_LIMIT = 155

    # Maps every extensionless or slashless spelling of a page URL to the URL
    # Jekyll publishes, which is also the URL in its canonical tag.
    def self.canonical_index(site)
      site.config["search_coverage_index"] ||= begin
        index = {}
        # Redirect stubs never become link targets: /cookbook.html and the
        # /cookbook/ stub both answer to "/cookbook", and the page must win.
        site.pages.each do |page|
          next if page.data["layout"] == "redirect"

          url = page.url
          if url.end_with?(".html")
            index[url.delete_suffix(".html")] = url
          elsif url.end_with?("/") && url != "/"
            index[url.delete_suffix("/")] = url
          end
        end
        index
      end
    end

    def self.canonical_href(site, href)
      return href unless href.is_a?(String)

      prefix = href.start_with?(SITE_URL) ? SITE_URL : ""
      rest = href.delete_prefix(prefix)
      return href unless rest.start_with?("/")

      path, suffix = rest.split(/(?=[#?])/, 2)
      target = canonical_index(site)[path]
      target ? "#{prefix}#{target}#{suffix}" : href
    end

    def self.rewrite_links(site, html)
      html.gsub(/href="([^"]+)"/) { %(href="#{canonical_href(site, Regexp.last_match(1))}") }
    end

    def self.first_sentence(text)
      line = text.to_s.strip.lines.first.to_s.strip
      line = line.sub(/\A(.{1,#{DESCRIPTION_LIMIT}}?[.!?])(\s.*)?\z/m, '\1')
      return line if line.length <= DESCRIPTION_LIMIT

      "#{line[0, DESCRIPTION_LIMIT - 1].sub(/\s+\S*\z/, "")}…"
    end

    def self.node_description(page)
      section = page.content[/^## Description\s*\n+(.+?)(?=^## |\z)/m, 1]
      sentence = first_sentence(section)
      sentence.empty? ? "#{page.data["title"]} node in the #{page.data["namespace"]} namespace." : sentence
    end

    def self.namespace_description(page)
      names = page.content.scan(/^- \*\*\[([^\]]+)\]/).flatten
      namespace = page.data["title"].to_s.delete_suffix(" Nodes")
      return nil if names.empty?

      listed = names.first(6).join(", ")
      more = names.length > 6 ? ", and more" : ""
      first_sentence("#{namespace} node reference: #{listed}#{more}.")
    end

    def self.describe_generated_pages(site)
      site.pages.each do |page|
        next unless page.path.start_with?("nodes/") && page.data["description"].nil?

        description =
          if page.data["node_type"]
            node_description(page)
          elsif page.data["title"].to_s.end_with?(" Nodes")
            namespace_description(page)
          end
        next unless description

        page.data["description"] = description
        page.data["description_generated"] = true
      end
    end

    def self.exclude_non_canonical_from_sitemap(site)
      site.pages.each do |page|
        external_canonical = page.data["canonical_url"].to_s.start_with?("http") &&
                             !page.data["canonical_url"].start_with?(SITE_URL)
        page.data["sitemap"] = false if page.data["layout"] == "redirect" || external_canonical
      end
    end

    class MovedPages < Generator
      safe true
      priority :high

      def generate(site)
        Array(site.data["moved_pages"]).each do |entry|
          from = entry["from"]
          name = from.end_with?("/") ? "index.html" : File.basename(from)
          dir = from.end_with?("/") ? from : File.dirname(from)
          page = PageWithoutAFile.new(site, site.source, dir, name)
          page.data.merge!(
            "layout" => "redirect",
            "permalink" => from,
            "redirect_to" => entry["to"],
            "title" => "Redirecting",
            "sitemap" => false
          )
          page.content = "This page has moved. Please go to [#{entry["to"]}](#{entry["to"]})."
          site.pages << page
        end
      end
    end
  end

  module SearchCoverageFilter
    def canonical_href(href)
      SearchCoverage.canonical_href(@context.registers[:site], href)
    end
  end
end

Jekyll::Hooks.register :site, :post_read do |site|
  Jekyll::SearchCoverage.describe_generated_pages(site)
end

# After generators, so the moved-page stubs are covered, and before
# jekyll-sitemap renders, which happens in the render phase.
Jekyll::Hooks.register :site, :pre_render do |site|
  site.config.delete("search_coverage_index")
  Jekyll::SearchCoverage.exclude_non_canonical_from_sitemap(site)
end

Jekyll::Hooks.register [:pages, :documents], :post_render do |doc|
  next unless doc.output_ext == ".html" && doc.output

  doc.output = Jekyll::SearchCoverage.rewrite_links(doc.site, doc.output)
end

Liquid::Template.register_filter(Jekyll::SearchCoverageFilter)
