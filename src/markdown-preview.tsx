/* eslint jsx-a11y/no-static-element-interactions: 0 */
/* eslint jsx-a11y/no-noninteractive-tabindex: 0 */

import Markdown from "@nteract/markdown";
import {
  Input,
  Outputs,
  PromptBuffer
} from "@nteract/presentational-components";
import React from "react";

interface Props {
  source: string;
  focusEditor: () => void;
  unfocusEditor: () => void;
  focusAbove: () => void;
  focusBelow: () => void;
  cellFocused: boolean;
  editorFocused: boolean;
  children: React.ReactNode;
}

interface State {
  view: boolean;
}

const noop = () => {};

// TODO: Consider whether this component is really something like two components:
//
//       * a behavioral component that tracks focus (possibly already covered elsewhere)
//       * the actual markdown previewer
//
//       Since I'm really unsure and don't want to write a silly abstraction that
//       only I (@rgbkrk) understand, I'll wait for others to reflect on this
//       within the code base (or leave it alone, which is totally cool too). :)

export default class MarkdownCell extends React.Component<Props, State> {
  static defaultProps = {
    cellFocused: false,
    editorFocused: false,
    focusAbove: noop,
    focusBelow: noop,
    focusEditor: noop,
    unfocusEditor: noop,
    source: ""
  };

  rendered!: HTMLDivElement | null;

  constructor(props: Props) {
    super(props);
    this.state = {
      view: true
    };
    this.openEditor = this.openEditor.bind(this);
    this.editorKeyDown = this.editorKeyDown.bind(this);
    this.renderedKeyDown = this.renderedKeyDown.bind(this);
    this.closeEditor = this.closeEditor.bind(this);
  }

  componentDidMount(): void {
    this.updateFocus();
  }

  componentWillReceiveProps(nextProps: Props): void {
    this.setState({
      view: !nextProps.editorFocused
    });
  }

  componentDidUpdate(): void {
    this.updateFocus();
  }

  updateFocus(): void {
    if (
      this.rendered &&
      this.state &&
      this.state.view &&
      this.props.cellFocused
    ) {
      this.rendered.focus();
      if (this.props.editorFocused) {
        this.openEditor();
      }
    }
  }

  /**
   * Handles when a keydown event occurs on the unrendered MD cell
   */
  editorKeyDown(e: React.KeyboardEvent): void {
    const shift = e.shiftKey;
    const ctrl = e.ctrlKey;
    if ((shift || ctrl) && e.key === "Enter") {
      this.closeEditor();
    }
  }

  closeEditor(): void {
    this.setState({ view: true });
    this.props.unfocusEditor();
  }

  openEditor(): void {
    this.setState({ view: false });
    this.props.focusEditor();
  }

  /**
   * Handles when a keydown event occurs on the rendered MD cell
   */
  renderedKeyDown(e: React.KeyboardEvent) {
    const shift = e.shiftKey;
    const ctrl = e.ctrlKey;
    if ((shift || ctrl) && e.key === "Enter") {
      if (this.state.view) {
        return;
      }
      // This likely isn't even possible, as we _should_ be in view mode
      this.closeEditor();
      return;
    }

    switch (e.key) {
      case "Enter":
        this.openEditor();
        e.preventDefault();
        return;
      case "ArrowUp":
        this.props.focusAbove();
        break;
      case "ArrowDown":
        this.props.focusBelow();
        break;
      default:
    }
    return;
  }

  render() {
    const source = this.props.source;

    return this.state && this.state.view ? (
      <div
        onDoubleClick={this.openEditor}
        onKeyDown={this.renderedKeyDown}
        ref={rendered => {
          this.rendered = rendered;
        }}
        tabIndex={this.props.cellFocused ? 0 : undefined}
        style={{
          outline: "none"
        }}
      >
        <Outputs>
          <Markdown
            source={
              source
                ? source
                : "*Empty markdown cell, double click me to add content.*"
            }
          />
        </Outputs>
      </div>
    ) : (
      <div onKeyDown={this.editorKeyDown}>
        <Input>
          <PromptBuffer />
          {/* The editor */}
          {this.props.children}
        </Input>
        <Outputs hidden={source === ""}>
          <Markdown
            source={
              source
                ? source
                : "*Empty markdown cell, double click me to add content.*"
            }
          />
        </Outputs>
      </div>
    );
  }
}
