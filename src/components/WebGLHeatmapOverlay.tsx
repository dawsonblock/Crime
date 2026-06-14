import React, { useEffect, useRef } from "react";
import L from "leaflet";
import { EventItem } from "../types";

interface WebGLHeatmapOverlayProps {
  map: L.Map | null;
  events: EventItem[];
  opacity: number;
  radiusMultiplier: number;
}

export default function WebGLHeatmapOverlay({
  map,
  events,
  opacity,
  radiusMultiplier,
}: WebGLHeatmapOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const bufferRef = useRef<WebGLBuffer | null>(null);

  const redraw = () => {
    const canvas = canvasRef.current;
    const gl = glRef.current;
    const program = programRef.current;
    if (!map || !canvas || !gl || !program) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const width = parent.clientWidth;
    const height = parent.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    // Transparent background
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (events.length === 0) return;

    // Prepare vertex data
    // vertex: 2 floats for normalized position [0,1], 1 float for point size, 4 floats for color (RGBA)
    // 7 floats total per vertex
    const vertexData = new Float32Array(events.length * 7);

    events.forEach((evt, idx) => {
      const latLng = L.latLng(evt.latitude, evt.longitude);
      const containerPoint = map.latLngToContainerPoint(latLng);

      const normX = containerPoint.x / width;
      const normY = containerPoint.y / height;

      // Base radius in meters matching the original values
      let radiusMeters = 180;
      let colorRGBA = [0.23, 0.51, 0.96, opacity]; // default low severity - blue gradient

      if (evt.severity === "critical") {
        radiusMeters = 350;
        colorRGBA = [1.0, 0.27, 0.27, opacity * 1.5]; // high-contrast hot red
      } else if (evt.severity === "high") {
        radiusMeters = 280;
        colorRGBA = [0.96, 0.62, 0.04, opacity * 1.2]; // luminous orange
      } else if (evt.severity === "medium") {
        radiusMeters = 220;
        colorRGBA = [0.92, 0.70, 0.03, opacity]; // amber
      }

      // Convert ground meters radius into precise pixels at the current scale
      const latOffset = (radiusMeters * radiusMultiplier) / 111320;
      const p1 = map.latLngToContainerPoint([evt.latitude, evt.longitude]);
      const p2 = map.latLngToContainerPoint([evt.latitude + latOffset, evt.longitude]);
      const pixelRadius = Math.max(4, Math.abs(p1.y - p2.y));

      // Diameter mapping onto point size
      const pointSize = pixelRadius * 2.0 * dpr;

      const offset = idx * 7;
      vertexData[offset + 0] = normX;
      vertexData[offset + 1] = normY;
      vertexData[offset + 2] = pointSize;
      vertexData[offset + 3] = colorRGBA[0];
      vertexData[offset + 4] = colorRGBA[1];
      vertexData[offset + 5] = colorRGBA[2];
      vertexData[offset + 6] = colorRGBA[3];
    });

    gl.bindBuffer(gl.ARRAY_BUFFER, bufferRef.current);
    gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.DYNAMIC_DRAW);

    const aPosition = gl.getAttribLocation(program, "aPosition");
    const aSize = gl.getAttribLocation(program, "aSize");
    const aColor = gl.getAttribLocation(program, "aColor");

    gl.enableVertexAttribArray(aPosition);
    gl.enableVertexAttribArray(aSize);
    gl.enableVertexAttribArray(aColor);

    const stride = 7 * Float32Array.BYTES_PER_ELEMENT;
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);
    gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);

    // Setup alpha blending & additive blending for high performance heat representation
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // Summing intensities additively for overlapping density reports

    gl.drawArrays(gl.POINTS, 0, events.length);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl =
      canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: true }) ||
      (canvas.getContext("experimental-webgl", { alpha: true, antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: true }) as WebGLRenderingContext | null);

    if (!gl) {
      console.error("WebGL context instantiation failed.");
      return;
    }

    glRef.current = gl;

    const vsSource = `
      attribute vec2 aPosition;
      attribute float aSize;
      attribute vec4 aColor;
      varying vec4 vColor;
      void main() {
          vec2 clipSpace = aPosition * 2.0 - 1.0;
          gl_Position = vec4(clipSpace.x, -clipSpace.y, 0.0, 1.0);
          gl_PointSize = aSize;
          vColor = aColor;
      }
    `;

    const fsSource = `
      precision mediump float;
      varying vec4 vColor;
      void main() {
          float d = distance(gl_PointCoord, vec2(0.5));
          if (d > 0.5) {
              discard;
          }
          float intensity = 1.0 - (d / 0.5);
          float alpha = pow(intensity, 1.8);
          gl_FragColor = vec4(vColor.rgb, alpha * vColor.a);
      }
    `;

    const compileShader = (source: string, type: number) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Shader build error:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = compileShader(vsSource, gl.VERTEX_SHADER);
    const fs = compileShader(fsSource, gl.FRAGMENT_SHADER);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Program link error:", gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return;
    }

    programRef.current = program;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    bufferRef.current = buffer;

    return () => {
      if (buffer) gl.deleteBuffer(buffer);
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      if (program) gl.deleteProgram(program);
    };
  }, []);

  useEffect(() => {
    if (!map) return;

    redraw();

    const onMapChange = () => {
      redraw();
    };

    map.on("move", onMapChange);
    map.on("zoom", onMapChange);
    map.on("resize", onMapChange);
    map.on("viewreset", onMapChange);

    return () => {
      map.off("move", onMapChange);
      map.off("zoom", onMapChange);
      map.off("resize", onMapChange);
      map.off("viewreset", onMapChange);
    };
  }, [map, events, opacity, radiusMultiplier]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 400,
      }}
    />
  );
}
