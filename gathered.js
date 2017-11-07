
var request = require('request-promise'),
    errors = require('request-promise/errors'),
    cheerio = require('cheerio'),
    papa = require('papaparse'),
    prompt = require('prompt'),
    fs = require('fs'),
    csvWriter = require('csv-write-stream');

var buildContent = {
  data : [],
  schema : {},
  init : function() {
    this.getUserInput();
  },
  getUserInput: function() {
    // get the CSV file path to parse from the user.
    var inputSchema = {
      properties: {
        filename: {
          description: "Please enter the file path"
        },
        type: {
          description: "Please enter the slug for the post type"
        }
      }
    };
    prompt.start();
    prompt.get(inputSchema, function (err, inputSchema) {
        if (err) { return onErr(err); }

        // load file to a string. need to add error handling.
        buildContent.schema = inputSchema;
        var file = fs.readFileSync(inputSchema.filename, 'UTF-8');
        // parse CSV.
        buildContent.parsePages(file);
    });
  },
  parsePages : function(file) {
    papa.parse(file, {
      header: true,
      complete: function(results) {
        if (results.errors.length) {
          onErr(results.errors);
        }
        console.log('Getting CSV Contents:',results.data.length,'items found.');
        // grab content based on URLs in the file.
        buildContent.getPages(results.data);
    	}
    });

    return true;
  },
  getPages : function (rows) {
    console.log('Accessing page contents.');

    for(var i = 0, len = rows.length; i<1; i++) { // stubbing out count since we have a lot of records.
      var row = rows[i];
      var options = {
      	uri: row.URL,
      	transform: function(body) {
      		return cheerio.load(body);
      	}
      };

      request(options)
      	.then(function($) {
      		var content = $('#maincol');
          var item = {
            type: buildContent.schema.type,
            //url: url,
            'title': buildContent.scrub( content.find('h1').first().text() ),
            'dateline': buildContent.scrub( content.find('.author').first().text() ),
            'content': content.find('.blog-body').html().replace(/[\x00-\x1F\x7F-\x9F]/g, "")
          };
          console.log(item);
      		buildContent.data.push(item);
      	})
        .catch( function(err) {onErr(err);} )
        .finally(function() {
          // if all requests are zeroed out, write to file.

        })
    }
  },
  writeContent : function () {
    //console.log('writeContent:', buildContent.data);
    //console.log(JSON.stringify());
  },
  scrub : function (content) {
    return content.trim().replace(/[\x00-\x1F\x7F-\x9F]/g, "");
  }
};

function onErr(err) {
  console.log('Error: ', err);
  return true;
}

buildContent.init();
