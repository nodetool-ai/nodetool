const UGC_FINAL = "/app-preview/media/ugc-product-video/final.mp4";

export const UGC_PRODUCT_VIDEO_APP = {
  slug: "ugc-product-video",
  name: "UGC Product Video",
  emoji: "🤳",
  featured: true,
  tagline: "One face. One take. Fifteen seconds.",
  description:
    "Start with creator and product references plus a 15-second script. MiniMax H3 generates the performance, lip-sync, and voice together, with the product limited to one short middle proof beat.",
  note: "🔑 Writing uses OpenAI. The testimonial uses MiniMax H3 on AtlasCloud with native audio.",
  workflows: {
    copy: "Ad Copy in Three Registers",
    creator: "Generate a Native-Audio UGC Testimonial"
  },
  variables: [
    {
      id: "offer",
      name: "Offer",
      scope: "user",
      persist: true,
      type: "str",
      default:
        "Olive Travel Cup: a matte muted-olive cup with a charcoal lid for a calmer morning routine"
    },
    {
      id: "creatorImage",
      name: "Vertical creator reference",
      scope: "instance",
      type: "image"
    },
    {
      id: "productImage",
      name: "Product reference",
      scope: "instance",
      type: "image"
    },
    {
      id: "creatorScript",
      name: "15-second creator script",
      scope: "instance",
      type: "str",
      default:
        "I did not expect a travel cup to fix my mornings, but this one did. The lid never leaks in my bag, the finish feels great, and my coffee stays hot through my first meeting. I use it every day."
    },
    {
      id: "creatorClip",
      name: "Creator testimonial",
      scope: "instance",
      type: "video"
    },
    {
      id: "audience",
      name: "Audience",
      scope: "user",
      persist: true,
      type: "str",
      default: "busy professionals who want a calmer start to the day"
    }
  ],
  operations: [
    {
      id: "copy",
      name: "Angles",
      workflow: "copy",
      policy: "replace",
      inputs: { offer: { from: "variable", variableId: "offer" } }
    },
    {
      id: "creator",
      name: "Creator testimonial",
      workflow: "creator",
      policy: "replace",
      timeoutMs: 600000,
      inputs: {
        creator_image: { from: "variable", variableId: "creatorImage" },
        product_image: { from: "variable", variableId: "productImage" },
        script: { from: "variable", variableId: "creatorScript" },
        product: { from: "variable", variableId: "offer" }
      },
      outputs: {
        video: { to: "variable", variableId: "creatorClip" }
      }
    }
  ],
  sections: [
    {
      title: "1 · Choose the angle",
      controls: [
        {
          textVar: "offer",
          label: "What are you selling?",
          multiline: true
        },
        {
          note:
            "Pick the promise before touching footage. A UGC hook should create curiosity without making a claim the product cannot support."
        },
        {
          run: ["copy"],
          label: "Explore three angles",
          disabledWhen: "copy"
        }
      ],
      results: [
        { progress: "copy", label: "Writing three routes…" },
        { error: "copy", label: "The angle pass failed" },
        {
          show: "variants",
          op: "copy",
          as: "Markdown",
          label: "Angles to adapt",
          demo:
            "**Plain**\nA matte cup with a charcoal lid for the morning routine.\n\n**Playful**\nThe cup that makes it out the door with you.\n\n**Premium**\nA quieter start, designed to travel."
        }
      ]
    },
    {
      title: "2 · Generate one continuous testimonial",
      controls: [
        {
          note:
            "Image 1 anchors the creator and room. Image 2 anchors only the product. MiniMax H3 generates voice and lip movement with the picture, then permits the cup on screen only from 4.5 to 7 seconds."
        },
        { image: "creatorImage", label: "Vertical creator image" },
        { image: "productImage", label: "Clean product image" },
        {
          textVar: "creatorScript",
          label: "Complete 15-second script",
          multiline: true
        },
        {
          run: ["creator"],
          label: "Make the 15-second testimonial",
          disabledWhen: "creator"
        }
      ],
      results: [
        {
          progress: "creator",
          label: "Generating voice, lip-sync, and motion together…"
        },
        { error: "creator", label: "The creator testimonial failed" },
        {
          showVar: "creatorClip",
          as: "Video",
          label: "Continuous creator testimonial",
          demo: UGC_FINAL
        }
      ]
    },
    {
      title: "3 · Review the complete Reel",
      controls: [
        { textVar: "audience", label: "Audience", multiline: true },
        {
          note:
            "Watch once for voice and lip-sync, then again for product timing. The cup should appear once for no more than about three seconds and be absent from the opening and close."
        }
      ],
      results: [
        {
          showVar: "creatorClip",
          as: "Video",
          label: "15-second UGC Reel",
          demo: UGC_FINAL
        }
      ]
    }
  ]
};
