import React from "react";
import { Type, Image as ImageIcon, Sparkles, Film, Wand2 } from "lucide-react";
import {
  NodeCanvas,
  FlowNode,
  NodeProperty,
  NodeText,
  HandleRow,
  NodeChip,
  NodePreview,
  FlowEdge,
} from "../../components/flow";

// Internal reference page: a 1:1 static replica of the AI Product Launch Video
// workflow, used to compare the marketing node UI against the live editor.
export default function FlowPreviewPage() {
  return (
    <main style={{ minHeight: "100vh", background: "#08090A" }}>
      <NodeCanvas style={{ width: 1480, height: 980 }}>
        {/* edges (drawn under the nodes) */}
        <FlowEdge from={[330, 150]} to={[470, 250]} color="string" />
        <FlowEdge from={[330, 360]} to={[470, 290]} color="string" />
        <FlowEdge from={[330, 545]} to={[470, 330]} color="string" />
        <FlowEdge from={[330, 760]} to={[956, 470]} color="image" />
        <FlowEdge from={[936, 320]} to={[956, 430]} color="string" />
        <FlowEdge from={[1393, 470]} to={[1100, 480]} color="image" />

        <FlowNode
          title="String Input"
          icon={<Type size={16} />}
          style={{ left: 40, top: 40 }}
        >
          <NodeProperty label="Value">
            Launch video for the Aurora Trail smart fitness watch, highlighting
            outdoor adventure tracking.
          </NodeProperty>
          <HandleRow side="out" color="string" />
        </FlowNode>

        <FlowNode
          title="String Input"
          icon={<Type size={16} />}
          style={{ left: 40, top: 250 }}
        >
          <NodeProperty label="Value">
            active millennials who enjoy weekend hiking and fitness challenges
          </NodeProperty>
          <HandleRow side="out" color="string" />
        </FlowNode>

        <FlowNode
          title="String Input"
          icon={<Type size={16} />}
          style={{ left: 40, top: 460 }}
        >
          <NodeProperty label="Value">
            GPS navigation, heart-rate analytics, adaptive coaching, water
            resistance
          </NodeProperty>
          <HandleRow side="out" color="string" />
        </FlowNode>

        <FlowNode
          title="Image Input"
          icon={<ImageIcon size={16} />}
          minHeight={230}
          style={{ left: 40, top: 660 }}
        >
          <NodePreview src="/smartwatch.png" ratio="4 / 3" />
          <HandleRow side="out" color="image" />
        </FlowNode>

        <FlowNode
          title="Prompt"
          icon={<Wand2 size={16} />}
          width={486}
          style={{ left: 470, top: 60 }}
        >
          <NodeText>
            {`Using the text and image inputs, write a video prompt for a single 16:9 product shot. Give clear instructions on the animations and movements in the video.`}
          </NodeText>
          <div style={{ padding: "0 8px", marginBottom: 8 }}>
            <NodeChip>{`{{ brief }}`}</NodeChip>
            <NodeChip>{`{{ audience }}`}</NodeChip>
            <NodeChip>{`{{ features }}`}</NodeChip>
          </div>
          <HandleRow side="in" color="string" label="Brief" />
          <HandleRow side="in" color="string" label="Audience" />
          <HandleRow side="in" color="string" label="Features" />
          <HandleRow side="out" color="string" />
        </FlowNode>

        <FlowNode
          title="Agent"
          icon={<Sparkles size={16} />}
          width={457}
          control
          style={{ left: 956, top: 360 }}
        >
          <NodeProperty label="Prompt:" mono>
            {`Macro close-up, 50mm lens, low angle. A slow, smooth forward camera push on the Aurora Trail smartwatch resting on a wet, mossy river rock at dawn. Crisp water droplets bead and slide off the curved glass.`}
          </NodeProperty>
          <HandleRow side="out" color="string" />
        </FlowNode>

        <FlowNode
          title="Image To Video"
          icon={<Film size={16} />}
          width={460}
          minHeight={300}
          style={{ left: 1393, top: 400 }}
        >
          <NodePreview src="/product_video_example.mp4" video ratio="16 / 9" />
          <HandleRow side="out" color="video" />
        </FlowNode>
      </NodeCanvas>
    </main>
  );
}
