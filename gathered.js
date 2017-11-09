var Promise = require('bluebird');

var request = require('request-promise'),
    errors = require('request-promise/errors'),
    cheerio = require('cheerio'),
    papa = require('papaparse'),
    prompt =  require('prompt'),
    fs = require('fs'),
    csvWriter = require('csv-write-stream');

var buildContent = {
  data : [],
  schema : {},
  urlStream : '',
  pageList : [],
  init : function() {
    // promises promises
    this.getUserInput();
    //Promise.all(main).then(this.writeContent());
  },
  getUserInput: function() {
    // get the CSV file path to parse from the user.
    var inputSchema = {
      properties: {
        // would be _nice_ to make sure this exists and throw an error if not.
        // but this is a developer utility for a project at the moment.
        filename: {
          description: "Please enter the file path"
        },
        type: {
          description: "Please enter the slug for the post type"
        }
      }
    };
    var that = this;
    prompt.start();
    prompt.get(inputSchema, function (err, inputSchema) {
        if (err) { return onErr(err); }

        // load file to a string. need to add error handling.
        that.schema = inputSchema;
        var file = fs.readFileSync(inputSchema.filename, 'UTF-8');
        that.urlStream = file;
        that.parsePages();
        // chainable
        return this;
    });
  },
  parsePages : function() {
    var that = this;

    papa.parse(this.urlStream, {
      header: true,
      complete: function(results) {
        if (results.errors.length) {
          onErr(results.errors);
        }
        console.log('Getting CSV Contents:',results.data.length,'items found.');
        that.pageList = results.data;
        that.getPages();
    	}
    });

    return this;
  },
  getPages : function () {
    console.log('Accessing page contents.');
    // this has to use promises.
    var that = this;
    var requests = [];
    for(var i = 0, len = this.pageList.length; i < len; i++) { // stubbing out count since we have a lot of records.
        var row = this.pageList[i];
        var options = {
          uri: row.URL,
          transform: function(body) {
            return cheerio.load(body);
          }
        };
        requests.push(
          request(options)
          .then(function($) {
            var content = $('#maincol');
            // make sure these things exist before we try to clean them up.
            var item = {
              type : that.schema.type
            };
            var title = content.find('h1').first().text();
            var date = content.find('.author').first().text();
            var body = content.find('.blog-body').html();
            if (title) {
              item.title = that.scrub(title);
            }
            if (date) {
              item.date = that.scrub(date);
            }
            if (body) {
              item.body = body.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
            }
            //console.log(item);
            that.data.push(item);
          })
        );
    } // end for.

    Promise.all(requests).then(function() {
      that.writeContent();
    })
    .catch(function(e){throw e;});
  },
  writeContent : function () {
    console.log('writeContent:', this.data);
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
