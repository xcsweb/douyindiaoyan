# Fixed presenter face anchor

The normal component renderer uses its already configured isolated Python runtime
and local OpenCV frontal-face detector. It examines one decoded image or at most
five pictures from the actual prepared video range and keeps one median anchor.
There is no face tracking, external service, new model download or change to the
presenter window, captions, frame clock or source audio. Detection is approximate;
the preview still requires visual review. Failure to find a face uses centered
cover without extra zoom and records the reason in runtime.presenterFaceFraming.

Optional presenter.face = {"cx":0.5,"cy":0.35,"h":0.28} supplies a manual normalized
face center and height. Optional w records width. presenter.framing = "none" keeps
the previous media fitting. In workflows which already support mediaPolicies, an
explicit fit or focus for the presenter source retains that manual policy unless
a manual presenter.face is also supplied. Do not invent crop or position aliases.

The natural size of the decoded picture controls crop geometry, including rotated
inputs. One uniform scale is applied inside the existing rectangle or circle; the
source image is never stretched to change the face shape.
