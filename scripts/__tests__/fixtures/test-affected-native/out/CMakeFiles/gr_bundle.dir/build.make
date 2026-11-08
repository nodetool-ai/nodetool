# Synthetic Makefile rule of the gr_bundle custom target.
gr_bundle:
	/usr/bin/node @ROOT@/native/graph-runner/unittests/build-bundle.mjs @BUILD@/ctx-test.mjs
