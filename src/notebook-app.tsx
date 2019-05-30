/* eslint-disable no-return-assign */
import {
  CellId,
  CellType,
  ExecutionCount,
  ImmutableCodeCell,
  JSONObject
} from "@nteract/commutable";
import { actions, selectors } from "@nteract/core";
import {
  KernelOutputError,
  Media,
  Output,
  RichMedia,
  StreamText
} from "@nteract/outputs";
import {
  Cell as PlainCell,
  DarkTheme,
  Input,
  LightTheme,
  Outputs,
  Pagers,
  Prompt,
  Source
} from "@nteract/presentational-components";
import { AppState, ContentRef, KernelRef } from "@nteract/types";
import * as Immutable from "immutable";
import * as React from "react";
import { DragDropContext as dragDropContext } from "react-dnd";
import HTML5Backend from "react-dnd-html5-backend";
import { connect } from "react-redux";
import { Dispatch } from "redux";
import { Subject } from "rxjs";

import CellCreator from "./cell-creator";
import DraggableCell from "./draggable-cell";
import Editor from "./editor";
import { HijackScroll } from "./hijack-scroll";
import MarkdownPreviewer from "./markdown-preview";
import NotebookHelmet from "./notebook-helmet";
import Toolbar, { CellToolbarMask } from "./toolbar";
import TransformMedia from "./transform-media";

import styled from "styled-components";

function getTheme(theme: string) {
  switch (theme) {
    case "dark":
      return <DarkTheme />;
    case "light":
    default:
      return <LightTheme />;
  }
}

const emptyList = Immutable.List();
const emptySet = Immutable.Set();

const Cell = styled(PlainCell).attrs((props: { isSelected: boolean }) => ({
  className: props.isSelected ? "selected" : ""
}))`
  /*
   * Show the cell-toolbar-mask if hovering on cell,
   * cell was the last clicked
   */
  &:hover ${CellToolbarMask}, &.selected ${CellToolbarMask} {
    display: block;
  }
`;

Cell.displayName = "Cell";

interface AnyCellProps {
  id: string;
  tags: Immutable.Set<string>;
  contentRef: ContentRef;
  channels?: Subject<any>;
  cellType: "markdown" | "code" | "raw";
  theme: string;
  source: string;
  executionCount: ExecutionCount;
  outputs: Immutable.List<any>;
  pager: Immutable.List<any>;
  cellStatus: string;
  cellFocused: boolean; // not the ID of which is focused
  editorFocused: boolean;
  sourceHidden: boolean;
  executeCell: () => void;
  deleteCell: () => void;
  clearOutputs: () => void;
  toggleParameterCell: () => void;
  toggleCellInputVisibility: () => void;
  toggleCellOutputVisibility: () => void;
  toggleOutputExpansion: () => void;
  changeCellType: (to: CellType) => void;
  outputHidden: boolean;
  outputExpanded: boolean;
  selectCell: () => void;
  focusEditor: () => void;
  unfocusEditor: () => void;
  focusAboveCell: () => void;
  focusBelowCell: () => void;
  updateOutputMetadata: (
    index: number,
    metadata: JSONObject,
    mediaType: string
  ) => void;
}

const makeMapStateToCellProps = (
  initialState: AppState,
  { id, contentRef }: { id: string; contentRef: ContentRef }
) => {
  const mapStateToCellProps = (state: AppState) => {
    const model = selectors.model(state, { contentRef });
    if (!model || model.type !== "notebook") {
      throw new Error(
        "Cell components should not be used with non-notebook models"
      );
    }

    const kernelRef = model.kernelRef;

    const cell = selectors.notebook.cellById(model, { id });
    if (!cell) {
      throw new Error("cell not found inside cell map");
    }

    const cellType = cell.cell_type;
    const outputs = cell.get("outputs", emptyList);

    const sourceHidden =
      (cellType === "code" &&
        (cell.getIn(["metadata", "inputHidden"]) ||
          cell.getIn(["metadata", "hide_input"]))) ||
      false;

    const outputHidden =
      cellType === "code" &&
      (outputs.size === 0 || cell.getIn(["metadata", "outputHidden"]));

    const outputExpanded =
      cellType === "code" && cell.getIn(["metadata", "outputExpanded"]);

    const tags = cell.getIn(["metadata", "tags"]) || emptySet;

    const pager = model.getIn(["cellPagers", id]) || emptyList;

    let channels: Subject<any> | undefined;
    if (kernelRef) {
      const kernel = selectors.kernel(state, { kernelRef });
      if (kernel) {
        channels = kernel.channels;
      }
    }

    return {
      cellFocused: model.cellFocused === id,
      cellStatus: model.transient.getIn(["cellMap", id, "status"]),
      cellType,
      channels,
      contentRef,
      editorFocused: model.editorFocused === id,
      executionCount: (cell as ImmutableCodeCell).get("execution_count", null),
      outputExpanded,
      outputHidden,
      outputs,
      pager,
      source: cell.get("source", ""),
      sourceHidden,
      tags,
      theme: selectors.userTheme(state)
    };
  };
  return mapStateToCellProps;
};

const makeMapDispatchToCellProps = (
  initialDispatch: Dispatch,
  { id, contentRef }: { id: string; contentRef: ContentRef }
) => {
  const mapDispatchToCellProps = (dispatch: Dispatch) => ({
    focusAboveCell: () => {
      dispatch(actions.focusPreviousCell({ id, contentRef }));
      dispatch(actions.focusPreviousCellEditor({ id, contentRef }));
    },
    focusBelowCell: () => {
      dispatch(
        actions.focusNextCell({ id, createCellIfUndefined: true, contentRef })
      );
      dispatch(actions.focusNextCellEditor({ id, contentRef }));
    },
    focusEditor: () => dispatch(actions.focusCellEditor({ id, contentRef })),
    selectCell: () => dispatch(actions.focusCell({ id, contentRef })),
    unfocusEditor: () =>
      dispatch(actions.focusCellEditor({ id: undefined, contentRef })),

    changeCellType: (to: CellType) =>
      dispatch(
        actions.changeCellType({
          contentRef,
          id,
          to
        })
      ),
    clearOutputs: () => dispatch(actions.clearOutputs({ id, contentRef })),
    deleteCell: () => dispatch(actions.deleteCell({ id, contentRef })),
    executeCell: () => dispatch(actions.executeCell({ id, contentRef })),
    toggleCellInputVisibility: () =>
      dispatch(actions.toggleCellInputVisibility({ id, contentRef })),
    toggleCellOutputVisibility: () =>
      dispatch(actions.toggleCellOutputVisibility({ id, contentRef })),
    toggleOutputExpansion: () =>
      dispatch(actions.toggleOutputExpansion({ id, contentRef })),
    toggleParameterCell: () =>
      dispatch(actions.toggleParameterCell({ id, contentRef })),

    updateOutputMetadata: (
      index: number,
      metadata: JSONObject,
      mediaType: string
    ) => {
      dispatch(
        actions.updateOutputMetadata({
          id,
          contentRef,
          metadata,
          index,
          mediaType
        })
      );
    }
  });
  return mapDispatchToCellProps;
};

const CellBanner = styled.div`
  background-color: darkblue;
  color: ghostwhite;
  padding: 9px 16px;

  font-size: 12px;
  line-height: 20px;
`;

CellBanner.displayName = "CellBanner";

class AnyCell extends React.PureComponent<AnyCellProps> {
  toggleCellType = () => {
    this.props.changeCellType(
      this.props.cellType === "markdown" ? "code" : "markdown"
    );
  };

  render() {
    const {
      executeCell,
      deleteCell,
      clearOutputs,
      toggleParameterCell,
      toggleCellInputVisibility,
      toggleCellOutputVisibility,
      toggleOutputExpansion,
      changeCellType,
      cellFocused,
      cellStatus,
      cellType,
      editorFocused,
      focusAboveCell,
      focusBelowCell,
      focusEditor,
      id,
      tags,
      theme,
      selectCell,
      unfocusEditor,
      contentRef,
      sourceHidden
    } = this.props;
    const running = cellStatus === "busy";
    const queued = cellStatus === "queued";
    let element = null;

    switch (cellType) {
      case "code":
        element = (
          <React.Fragment>
            <Input hidden={this.props.sourceHidden}>
              <Prompt
                counter={this.props.executionCount}
                running={running}
                queued={queued}
              />
              <Source>
                <Editor
                  id={id}
                  contentRef={contentRef}
                  focusAbove={focusAboveCell}
                  focusBelow={focusBelowCell}
                />
              </Source>
            </Input>
            <Pagers>
              {this.props.pager.map((pager, key) => (
                <RichMedia data={pager.data} metadata={pager.metadata}>
                  <Media.Json />
                  <Media.JavaScript />
                  <Media.HTML />
                  <Media.Markdown />
                  <Media.LaTeX />
                  <Media.SVG />
                  <Media.Image />
                  <Media.Plain />
                </RichMedia>
              ))}
            </Pagers>
            <Outputs
              hidden={this.props.outputHidden}
              expanded={this.props.outputExpanded}
            >
              {this.props.outputs.map((output, index) => (
                <Output output={output} key={index}>
                  <TransformMedia
                    output_type={"display_data"}
                    cellId={id}
                    contentRef={contentRef}
                    index={index}
                  />
                  <TransformMedia
                    output_type={"execute_result"}
                    cellId={id}
                    contentRef={contentRef}
                    index={index}
                  />
                  <KernelOutputError />
                  <StreamText />
                </Output>
              ))}
            </Outputs>
          </React.Fragment>
        );

        break;
      case "markdown":
        element = (
          <MarkdownPreviewer
            focusAbove={focusAboveCell}
            focusBelow={focusBelowCell}
            focusEditor={focusEditor}
            cellFocused={cellFocused}
            editorFocused={editorFocused}
            unfocusEditor={unfocusEditor}
            source={this.props.source}
          >
            <Source>
              <Editor
                id={id}
                contentRef={contentRef}
                focusAbove={focusAboveCell}
                focusBelow={focusBelowCell}
              />
            </Source>
          </MarkdownPreviewer>
        );
        break;

      case "raw":
        element = (
          <Source>
            <Editor
              id={id}
              contentRef={contentRef}
              focusAbove={focusAboveCell}
              focusBelow={focusBelowCell}
            />
          </Source>
        );
        break;
      default:
        element = <pre>{this.props.source}</pre>;
        break;
    }

    return (
      <HijackScroll focused={cellFocused} onClick={selectCell}>
        <Cell isSelected={cellFocused}>
          {/* The following banners come from when papermill's acknowledged
              cell.metadata.tags are set
          */}
          {tags.has("parameters") ? (
            <CellBanner>Papermill - Parametrized</CellBanner>
          ) : null}
          {tags.has("default parameters") ? (
            <CellBanner>Papermill - Default Parameters</CellBanner>
          ) : null}
          <Toolbar
            type={cellType}
            cellFocused={cellFocused}
            executeCell={executeCell}
            deleteCell={deleteCell}
            clearOutputs={clearOutputs}
            toggleParameterCell={toggleParameterCell}
            toggleCellInputVisibility={toggleCellInputVisibility}
            toggleCellOutputVisibility={toggleCellOutputVisibility}
            toggleOutputExpansion={toggleOutputExpansion}
            changeCellType={this.toggleCellType}
            sourceHidden={sourceHidden}
          />
          {element}
        </Cell>
      </HijackScroll>
    );
  }
}

export const ConnectedCell = connect(
  makeMapStateToCellProps,
  makeMapDispatchToCellProps
)(AnyCell);

type NotebookProps = NotebookStateProps & NotebookDispatchProps;

interface NotebookStateProps {
  cellOrder: Immutable.List<any>;
  theme: string;
  contentRef: ContentRef;
}

interface NotebookDispatchProps {
  moveCell: (payload: {
    id: CellId;
    destinationId: CellId;
    above: boolean;
    contentRef: ContentRef;
  }) => void;
  focusCell: (payload: { id: CellId; contentRef: ContentRef }) => void;
  executeFocusedCell: (payload: { contentRef: ContentRef }) => void;
  focusNextCell: (payload: {
    id?: CellId;
    createCellIfUndefined: boolean;
    contentRef: ContentRef;
  }) => void;
  focusNextCellEditor: (payload: {
    id?: CellId;
    contentRef: ContentRef;
  }) => void;
  updateOutputMetadata: (payload: {
    id: CellId;
    metadata: JSONObject;
    contentRef: ContentRef;
    index: number;
    mediaType: string;
  }) => void;
}

const makeMapStateToProps = (
  initialState: AppState,
  initialProps: { contentRef: ContentRef }
) => {
  const { contentRef } = initialProps;
  if (!contentRef) {
    throw new Error("<Notebook /> has to have a contentRef");
  }

  const mapStateToProps = (state: AppState): NotebookStateProps => {
    const content = selectors.content(state, { contentRef });
    const model = selectors.model(state, { contentRef });

    if (!model || !content) {
      throw new Error(
        "<Notebook /> has to have content & model that are notebook types"
      );
    }
    const theme = selectors.userTheme(state);

    if (model.type !== "notebook") {
      return {
        cellOrder: Immutable.List(),
        contentRef,
        theme
      };
    }

    if (model.type !== "notebook") {
      throw new Error(
        "<Notebook /> has to have content & model that are notebook types"
      );
    }

    return {
      cellOrder: model.notebook.cellOrder,
      contentRef,
      theme
    };
  };
  return mapStateToProps;
};

const Cells = styled.div`
  padding-top: var(--nt-spacing-m, 10px);
  padding-left: var(--nt-spacing-m, 10px);
  padding-right: var(--nt-spacing-m, 10px);
`;

const mapDispatchToProps = (dispatch: Dispatch): NotebookDispatchProps => ({
  executeFocusedCell: (payload: { contentRef: ContentRef }) =>
    dispatch(actions.executeFocusedCell(payload)),
  focusCell: (payload: { id: CellId; contentRef: ContentRef }) =>
    dispatch(actions.focusCell(payload)),
  focusNextCell: (payload: {
    id?: CellId;
    createCellIfUndefined: boolean;
    contentRef: ContentRef;
  }) => dispatch(actions.focusNextCell(payload)),
  focusNextCellEditor: (payload: { id?: CellId; contentRef: ContentRef }) =>
    dispatch(actions.focusNextCellEditor(payload)),
  moveCell: (payload: {
    id: CellId;
    destinationId: CellId;
    above: boolean;
    contentRef: ContentRef;
  }) => dispatch(actions.moveCell(payload)),
  updateOutputMetadata: (payload: {
    id: CellId;
    contentRef: ContentRef;
    metadata: JSONObject;
    index: number;
    mediaType: string;
  }) => dispatch(actions.updateOutputMetadata(payload))
});

// tslint:disable max-classes-per-file
export class NotebookApp extends React.PureComponent<NotebookProps> {
  static defaultProps = {
    theme: "light"
  };

  constructor(props: NotebookProps) {
    super(props);
    this.keyDown = this.keyDown.bind(this);
  }

  componentDidMount(): void {
    document.addEventListener("keydown", this.keyDown);
  }

  componentWillUnmount(): void {
    document.removeEventListener("keydown", this.keyDown);
  }

  keyDown(e: KeyboardEvent): void {
    // If enter is not pressed, do nothing
    if (e.keyCode !== 13) {
      return;
    }

    const {
      executeFocusedCell,
      focusNextCell,
      focusNextCellEditor,
      contentRef
    } = this.props;

    let ctrlKeyPressed = e.ctrlKey;
    // Allow cmd + enter (macOS) to operate like ctrl + enter
    if (process.platform === "darwin") {
      ctrlKeyPressed = (e.metaKey || e.ctrlKey) && !(e.metaKey && e.ctrlKey);
    }

    const shiftXORctrl =
      (e.shiftKey || ctrlKeyPressed) && !(e.shiftKey && ctrlKeyPressed);
    if (!shiftXORctrl) {
      return;
    }

    e.preventDefault();

    // NOTE: Order matters here because we need it to execute _before_ we
    // focus the next cell
    executeFocusedCell({ contentRef });

    if (e.shiftKey) {
      // Couldn't focusNextCell just do focusing of both?
      focusNextCell({ id: undefined, createCellIfUndefined: true, contentRef });
      focusNextCellEditor({ id: undefined, contentRef });
    }
  }

  render(): JSX.Element {
    return (
      <React.Fragment>
        <NotebookHelmet contentRef={this.props.contentRef} />
        <Cells>
          <CellCreator
            id={this.props.cellOrder.get(0)}
            above
            contentRef={this.props.contentRef}
          />
          {this.props.cellOrder.map(cellID => (
            <div className="cell-container" key={`cell-container-${cellID}`}>
              <DraggableCell
                moveCell={this.props.moveCell}
                id={cellID}
                focusCell={this.props.focusCell}
                contentRef={this.props.contentRef}
              >
                <ConnectedCell id={cellID} contentRef={this.props.contentRef} />
              </DraggableCell>
              <CellCreator
                key={`creator-${cellID}`}
                id={cellID}
                above={false}
                contentRef={this.props.contentRef}
              />
            </div>
          ))}
        </Cells>
        {getTheme(this.props.theme)}
      </React.Fragment>
    );
  }
}

export const ConnectedNotebook = dragDropContext(HTML5Backend)(NotebookApp);
export default connect(
  makeMapStateToProps,
  mapDispatchToProps
)(ConnectedNotebook);
