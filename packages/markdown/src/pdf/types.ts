export type Style = "regular" | "bold" | "italic" | "boldItalic";

export interface Word {
    text: string;
    style: Style;
}

export interface TextOp {
    type: "text";
    x: number;
    y: number;
    style: Style;
    size: number;
    text: string;
}

export interface LineOp {
    type: "line";
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

export type Op = TextOp | LineOp;

export interface Page {
    ops: Op[];
}

export type Token =
    | {
          type: "text";
          text: string;
          style: Style;
      }
    | { type: "break" };
