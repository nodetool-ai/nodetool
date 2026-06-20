# Minimal replacement for the `jekyll-mermaid` gem.
#
# The gem (v1.0.0) injected a full <script src="mermaid.min.js"> tag *inside*
# every {% mermaid %} block, which — combined with the load in the <head> —
# fetched and executed Mermaid multiple times per page. This tag emits only the
# diagram container; Mermaid itself is loaded once in _layouts/default.html, and
# only on pages that actually contain a diagram.
module Jekyll
  class MermaidBlock < Liquid::Block
    def render(context)
      "<div class=\"mermaid\">#{super}</div>"
    end
  end
end

Liquid::Template.register_tag("mermaid", Jekyll::MermaidBlock)
