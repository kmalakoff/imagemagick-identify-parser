/**
 * ImageMagickIdentifyReader(text[, camelCase = false]) -> ImageMagickIdentifyReader
 * - text (String): Output text from the `identify` program.
 * - camelCase (Boolean): Optional. If property names should be converted to
 *   camelCase. Defaults to `false`.
 *
 * Returns a parsed object representation of the input string.
**/

function ImageMagickIdentifyReader(text, camelCase) {
  if (this instanceof ImageMagickIdentifyReader) {
    throw new Error('Invalid use - this module is to be called, not instantiated.');
  }

  if (!isString(text)) {
    throw new Error('Invalid argument `text`: must be a String.');
  }

  var data = {};

  var input = text; // text.trim() would create another instance

  // If input is empty, no need to bother parsing it.
  if (input === '') return data;

  // Each new line should start with *at least* two spaces. This fixes 1st line.
  // input = ('  ' + input);
  var new_line_index = 0;
  var animated_image_count = 0;

  var stack = [data];
  var lastDepth = 1;
  var lastKey;

  /////////////////////////
  // BEGIN https://github.com/dandean/imagemagick-identify-parser/pull/5
  /////////////////////////
  var inHistogram = false;
  var histogramDepth;
  /////////////////////////
  // END https://github.com/dandean/imagemagick-identify-parser/pull/5
  /////////////////////////

  var t = this;

  while (new_line_index != -1) {
    next_new_line_index = input.indexOf('\n', new_line_index);
    if (next_new_line_index == -1) {
      line = input.substring(new_line_index);
      new_line_index = -1;
    }
    else {
      line = input.substring(new_line_index, next_new_line_index+1);
      new_line_index = next_new_line_index+1;
    }

    if (line.match(/^Image:/)) {
      // for now, skip later animated images. We should really return an array of exif data.
      if (++animated_image_count > 1) break;
    }

    var index = line.indexOf(':');

    // The line *must* contain a colon to be processed. This currently skips the
    // second line of the "Profiles" property. In the sample output, this line
    // contains simply "Display".
    if (index > -1) {

      var nextCharacter = line[index+1];

      // nextCharacter is undefined when ':' is the last char on the line.
      if (nextCharacter && nextCharacter.match(/\w/)) {

        // Start counting from the first ':'.
        for (var j=index+1; j<line.length; j++) {
          if (line[j] === ':') {
            // A new separator was found, use it's index to split the line on.
            index = j;
            break;
          }
        }
      }

      var raw_depth = line.match(/^ +/);
      var depth = raw_depth ? raw_depth[0].length / 2 : 1;
      var key = line.slice(0, index).trim();
      var value = line.slice(index + 1).trim() || {};

      // console.log('depth: ' + depth + ' stack: ' + require('util').inspect(stack));

      if (camelCase) {
        // Replace all non-word and underscore characters with a non-sequential space.
        key = key.replace(/[\W_]/g, ' ').replace(/\s+/g, ' ').toLowerCase();
        // Replace initial char in each work with an uppercase version.
        key = key.replace(/ \w/g, function(x) { return x.trim().toUpperCase(); });
      }

      if (isString(value)) {
        if (value.match(/^\-?\d+$/)) {
          // Convert int-looking values to actual numbers.
          value = parseInt(value, 10);

        } else if (value.match(/^\-?\d+?\.\d+$/)) {
          // Convert float-looking values to actual numbers.
          value = parseFloat(value, 10);

        } else if (value.match(/^true$/i)) {
          // Convert boolean TRUE looking values to `true`.
          value = true;

        } else if (value.match(/^false$/i)) {
          // Convert boolean FALSE looking values to `false`.
          value = false;

        } else if (value.match(/^undefined$/i)) {
          // Convert boolean FALSE looking values to `false`.
          continue;
        }
      }

      if (depth === 1 && key.match(/^Geometry$/i) && value.match(/^\d+x\d+\+\d+\+\d+$/)) {
        // Extract width and height from geometry property if present and value
        // is in format "INTxINT+INT+INT"
        var parts = value.split('x');
        data.width = parseInt(parts[0], 10);
        data.height = parseInt(parts[1], 10);
      }

      /////////////////////////
      // BEGIN https://github.com/dandean/imagemagick-identify-parser/pull/5
      /////////////////////////
      // Histogram and Colormap need special treatment since
      // their value tables are not left-aligned.
      if (key.match(/^Histogram$/i) || key.match(/^Colormap$/i)) {
        inHistogram = true;
        histogramDepth = depth;
        continue;
      }
      // Very long histogram counts might trigger the first test.
      // 2nd check: Does key look like a word rather than a number?
      if (depth === histogramDepth && key.match(/^\D+$/)) {
        inHistogram = false;
      }
      if (inHistogram === true) {
        continue;
      }
      /////////////////////////
      // END https://github.com/dandean/imagemagick-identify-parser/pull/5
      /////////////////////////

      if (depth === lastDepth) {

        // Add the key/value pair to the last object in the stack
        stack[stack.length-1][key] = value;

        // Note this key as the last key, which will become the parent key if
        // the next object is a child.
        lastKey = key;

      } else if (depth === lastDepth + 1) {
        // Add the last key (which should be an empty object) to the end of
        // the object stack. This allows us to match stack depth to
        // indentation depth.
        stack.push(stack[stack.length-1][lastKey]);
        stack[stack.length-1][key] = value;
        lastDepth++;
        lastKey = key;

      } else if (depth < lastDepth) {
        // Remove items from the end of the stack so that we add this new
        // key/value pair to the correct parent object.
        stack = stack.slice(0, depth);
        stack[stack.length-1][key] = value;
        lastDepth = depth;
        lastKey = key;
      }

    }
  }

  return data;
}

function isString(value) {
  return Object.prototype.toString.call(value) === '[object String]';
}

module.exports = ImageMagickIdentifyReader;