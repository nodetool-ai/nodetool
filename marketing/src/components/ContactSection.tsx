"use client";
import React from "react";
import { motion } from "framer-motion";
import Tilt3D from "./Tilt3D";
import { Mail, MapPin, ArrowRight } from "lucide-react";

export default function ContactSection() {
  return (
    <section
      id="contact"
      aria-labelledby="contact-title"
      className="relative py-24 overflow-hidden"
    >
      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-16 text-center max-w-3xl mx-auto">
          <motion.h2
            id="contact-title"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-6"
          >
            Get in <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
              touch
            </span>
          </motion.h2>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-lg text-slate-400"
          >
            Questions, bug reports, feature requests. We&apos;re here to help.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 max-w-4xl mx-auto">
          {[
            {
              icon: Mail,
              title: "General Inquiries",
              description: "Say hi or tell us what you need.",
              content: (
                <a
                  href="mailto:hello@nodetool.ai"
                  className="text-xl font-medium text-white hover:text-blue-400 transition-colors flex items-center justify-center"
                >
                  hello@nodetool.ai
                  <ArrowRight className="w-5 h-5 ml-2 opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-1" />
                </a>
              ),
            },
            {
              icon: MapPin,
              title: "The Team",
              description: "Direct contact to the developers.",
              content: (
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2 text-slate-300">
                    <span>Matthias:</span>
                    <a href="mailto:matti@nodetool.ai" className="text-blue-400 hover:text-blue-300 transition-colors">
                      matti@nodetool.ai
                    </a>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-slate-300">
                    <span>David:</span>
                    <a href="mailto:david@nodetool.ai" className="text-blue-400 hover:text-blue-300 transition-colors">
                      david@nodetool.ai
                    </a>
                  </div>
                </div>
              ),
            },
          ].map((card, i) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <Tilt3D className="h-full">
                <div className="group relative h-full flex flex-col items-center justify-center text-center rounded-2xl border border-white/5 bg-slate-900/40 backdrop-blur-sm p-10 transition-all duration-300 hover:bg-slate-900/60 hover:border-white/10 hover:shadow-2xl">
                  <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                    <card.icon className="w-8 h-8 text-blue-400" />
                  </div>
                  
                  <h3 className="text-xl font-semibold text-white mb-2">
                    {card.title}
                  </h3>
                  <p className="text-slate-400 mb-6">
                    {card.description}
                  </p>
                  
                  <div className="mt-auto">
                    {card.content}
                  </div>
                </div>
              </Tilt3D>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}



