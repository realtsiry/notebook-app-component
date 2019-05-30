import * as actions from "@nteract/actions";
import EditorView, { CodeMirrorEditorProps } from "@nteract/editor";
import * as selectors from "@nteract/selectors";
import { AppState, ContentRef } from "@nteract/types";
import { connect } from "react-redux";
import { Dispatch } from "redux";

interface InitialProps {
  id: string;
  contentRef: ContentRef;
  focusAbove: () => void;
  focusBelow: () => void;
}

const markdownMode = {
  name: "gfm",
  tokenTypeOverrides: {
    emoji: "emoji"
  }
};

const rawMode = {
  name: "text/plain",
  tokenTypeOverrides: {
    emoji: "emoji"
  }
};

const makeMapStateToProps = (
  initialState: AppState,
  initialProps: InitialProps
) => {
  const { id, contentRef, focusAbove, focusBelow } = initialProps;
  function mapStateToProps(state: AppState) {
    const model = selectors.model(state, { contentRef });
    if (!model || model.type !== "notebook") {
      throw new Error(
        "Connected Editor components should not be used with non-notebook models"
      );
    }
    const cell = selectors.notebook.cellById(model, { id });
    if (!cell) {
      throw new Error("cell not found inside cell map");
    }

    // Is our cell focused
    // This only gets used by dispatch
    const cellFocused = model.cellFocused === id;
    // Is our editor focused
    const editorFocused = model.editorFocused === id;

    const theme = selectors.userTheme(state);
    let channels = null;
    let kernelStatus = "not connected";

    // Bring all changes to the options based on cell type
    let codeMirrorMode = rawMode;

    let lineWrapping = false;

    switch (cell.cell_type) {
      case "markdown":
        lineWrapping = true;
        codeMirrorMode = markdownMode;
        break;
      case "raw":
        lineWrapping = true;
        codeMirrorMode = rawMode;
        break;
      case "code": {
        const kernelRef = model.kernelRef;
        const kernel = kernelRef
          ? state.core.entities.kernels.byRef.get(kernelRef)
          : null;

        channels = kernel ? kernel.channels : null;

        if (kernel) {
          kernelStatus = kernel.status || "not connected";
        }

        // otherwise assume we can use what's in the document
        codeMirrorMode =
          kernel && kernel.info
            ? kernel.info.codemirrorMode
            : selectors.notebook.codeMirrorMode(model);
      }
    }

    return {
      tip: true,
      completion: true,
      editorFocused,
      focusAbove,
      focusBelow,
      theme,
      value: cell.source,
      channels,
      kernelStatus,
      cursorBlinkRate: state.config.get("cursorBlinkRate", 530),
      mode: codeMirrorMode,
      lineWrapping
    };
  }
  return mapStateToProps;
};

const makeMapDispatchToProps = (
  initialDispatch: Dispatch,
  initialProps: InitialProps
) => {
  const { id, contentRef } = initialProps;
  const mapDispatchToProps = (dispatch: Dispatch) => {
    return {
      onChange: (text: string) => {
        dispatch(actions.updateCellSource({ id, value: text, contentRef }));
      },

      onFocusChange(focused: boolean): void {
        if (focused) {
          dispatch(actions.focusCellEditor({ id, contentRef }));
          // Assume we can focus the cell if now focusing the editor
          // If this doesn't work, we need to go back to checking !cellFocused
          dispatch(actions.focusCell({ id, contentRef }));
        }
      }
    };
  };
  return mapDispatchToProps;
};

export default connect(
  makeMapStateToProps,
  makeMapDispatchToProps
)(EditorView);
