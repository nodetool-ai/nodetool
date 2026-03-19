for file in $(cat files_to_fix.txt); do
  # Add 'import log from "loglevel";' below the last import statement
  # Awk command: finding the line after the last 'import ' line
  awk '
  /^import / { last_import = NR }
  { lines[NR] = $0 }
  END {
    for (i = 1; i <= NR; i++) {
      if (i == last_import) {
        print lines[i]
        print "import log from \"loglevel\";"
      } else {
        print lines[i]
      }
    }
  }' "$file" > "$file.tmp"

  # Replace require("loglevel") with log
  sed -i 's/require("loglevel")/log/g' "$file.tmp"
  sed -i "s/require('loglevel')/log/g" "$file.tmp"

  mv "$file.tmp" "$file"
done
