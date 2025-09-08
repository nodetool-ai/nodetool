import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import InfiniteScroll from '../InfiniteScroll';

describe('InfiniteScroll', () => {
  it('calls next when scrolled near bottom', () => {
    const next = jest.fn();
    const { container } = render(
      <InfiniteScroll next={next} hasMore loader={<div>loading</div>}>
        <div style={{ height: '200px' }}>content</div>
      </InfiniteScroll>
    );
    const div = container.firstChild as HTMLElement;
    // Set dimensions to simulate scrolling
    Object.defineProperty(div, 'scrollTop', { value: 50, writable: true });
    Object.defineProperty(div, 'scrollHeight', { value: 200, writable: true });
    Object.defineProperty(div, 'clientHeight', { value: 100, writable: true });
    fireEvent.scroll(div);
    expect(next).toHaveBeenCalled();
  });

  it('shows loader when hasMore is true', () => {
    const { getByText } = render(
      <InfiniteScroll next={() => {}} hasMore loader={<div>loading</div>}>
        <div>content</div>
      </InfiniteScroll>
    );
    expect(getByText('loading')).toBeInTheDocument();
  });
});
