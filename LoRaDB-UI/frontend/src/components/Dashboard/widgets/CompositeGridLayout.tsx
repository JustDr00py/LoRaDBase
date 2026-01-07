import React from 'react';
import GridLayout, { Layout, WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = WidthProvider(GridLayout);

interface CompositeGridLayoutProps {
  children: React.ReactElement[];  // Grid items
  layout: Layout[];                 // Current layout
  onLayoutChange: (layout: Layout[]) => void;
  editMode: boolean;                // Is editing enabled?
  cols?: number;                    // Grid columns (default 12)
  rowHeight?: number;               // Row height in px (default 40)
}

export const CompositeGridLayout: React.FC<CompositeGridLayoutProps> = ({
  children,
  layout,
  onLayoutChange,
  editMode,
  cols = 12,
  rowHeight = 40,
}) => {
  return (
    <div className="composite-grid-container">
      <ResponsiveGridLayout
        className="composite-inner-grid"
        layout={layout}
        cols={cols}
        rowHeight={rowHeight}
        onLayoutChange={onLayoutChange}
        isDraggable={editMode}
        isResizable={editMode}
        draggableHandle=".inner-widget-header"
        draggableCancel=".inner-widget-customize-btn"
        resizeHandles={['se']}
        compactType="vertical"
        preventCollision={false}
        margin={[12, 12]}
        containerPadding={[16, 16]}
      >
        {children}
      </ResponsiveGridLayout>
    </div>
  );
};
