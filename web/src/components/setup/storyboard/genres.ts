/**
 * The fourteen genres step 2 offers (PRD § 7.2), as data.
 *
 * A genre is picked before a screenplay exists, so it is written on the board
 * (`board.genre`) and read back into the Director prompt. The stored value is
 * the label, not the id: it reaches the model as prose ("Genre: Science
 * Fiction") and shows on the board as a chip, so a display string is the value
 * the whole path wants.
 *
 * Each genre names the `package://` still its card is meant to show.
 * {@link SHIPPED_GENRE_STILLS} is what decides whether that path is used: a
 * `package://` URI with no file behind it resolves to a URL that 404s, and the
 * card would render a broken-image icon. Until the art exists the card falls
 * back to type.
 */

/** Where the stills live inside the base-nodes asset directory. */
export const GENRE_STILL_PACKAGE = "nodetool-base";
export const GENRE_STILL_DIR = "storyboards/genres";

export interface StoryboardGenre {
  /** Stable id — the card's key, and the file name of its still. */
  id: string;
  /** What is written to `board.genre` and pasted into the Director prompt. */
  label: string;
  /** One line on the card: what the choice does to the direction. */
  description: string;
  /** `package://` URI of the card's still. */
  still: string;
}

const genre = (
  id: string,
  label: string,
  description: string
): StoryboardGenre => ({
  id,
  label,
  description,
  still: `package://${GENRE_STILL_PACKAGE}/${GENRE_STILL_DIR}/${id}.jpg`
});

export const STORYBOARD_GENRES: readonly StoryboardGenre[] = [
  genre("action", "Action", "Fast cuts, handheld weight, motion across the frame."),
  genre(
    "animation",
    "Animation",
    "Drawn or rendered frames and exaggerated timing, with no camera to obey."
  ),
  genre("comedy", "Comedy", "Wide framing, held beats, the joke landing on the cut."),
  genre(
    "commercial",
    "Commercial",
    "Product in focus, clean light, one claim per shot."
  ),
  genre(
    "documentary",
    "Documentary",
    "Observed framing and available light, subjects speaking for themselves."
  ),
  genre("drama", "Drama", "Close coverage and long takes, faces carrying the scene."),
  genre(
    "educational",
    "Educational",
    "One idea per shot and plain framing, with room for a voice over it."
  ),
  genre(
    "fantasy",
    "Fantasy",
    "Built worlds and wide vistas, light doing what the sun cannot."
  ),
  genre(
    "horror",
    "Horror",
    "Dark frames, withheld reveals, a camera slower than you want it."
  ),
  genre(
    "music-video",
    "Music Video",
    "Cuts on the beat, saturated colour, performance over plot."
  ),
  genre(
    "mystery",
    "Mystery",
    "Partial views and shadow, information held back a shot longer."
  ),
  genre(
    "romance",
    "Romance",
    "Warm light and two-shots, closeness measured in lens length."
  ),
  genre(
    "science-fiction",
    "Science Fiction",
    "Hard surfaces and cold light, scale read against a human."
  ),
  genre(
    "thriller",
    "Thriller",
    "Tight framing and a restless camera, tension built between cuts."
  )
];

/**
 * The genres whose still is actually checked in. Empty until the artwork is
 * drawn: registering a path with no file behind it renders a broken image on
 * every card. Add an id here in the same change that adds
 * `packages/base-nodes/nodetool/assets/nodetool-base/storyboards/genres/<id>.jpg`,
 * which is copied wholesale into the bundle — these stills need no entry in
 * `PACKAGE_RUNTIME_ASSETS`, which registers dist-adjacent files only.
 */
export const SHIPPED_GENRE_STILLS: ReadonlySet<string> = new Set<string>();

/** The card's still, or undefined while the artwork is missing. */
export const genreStill = (item: StoryboardGenre): string | undefined =>
  SHIPPED_GENRE_STILLS.has(item.id) ? item.still : undefined;

/** The genre a stored `board.genre` label names, or null. */
export const genreByLabel = (label: string): StoryboardGenre | null =>
  STORYBOARD_GENRES.find((item) => item.label === label) ?? null;
