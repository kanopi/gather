var yaml = require('js-yaml'),
    request = require('request-promise'),
    errors = require('request-promise/errors'),
    cheerio = require('cheerio'),
    papa = require('papaparse'),
    prompt =  require('prompt'),
    fs = require('fs'),
    csvWriter = require('csv-write-stream'),
    colors = require('colors');

// making console logging more readable.
colors.setTheme({
  silly: 'rainbow',
  input: 'grey',
  verbose: 'cyan',
  prompt: 'grey',
  info: 'green',
  data: 'grey',
  help: 'cyan',
  warn: 'yellow',
  debug: 'blue',
  error: 'red'
});

var buildContent = {
  config : '',
  data : [],
  pageList : [],
  init : function() {
    // I don't like having all of this in callback functions but chaining
    // this seems needlessly complicated. Ideas??
    this.getUserInput();
  },
  getUserInput : function() {
    // grab the data we need to build this post type out.
    var inputs = {
      properties: {
        // would be _nice_ to make sure this exists and throw an error if not.
        // but this is a developer utility for a project at the moment.
        config: {
          description: "Please enter the path to your YAML file"
        }
      }
    };
    var that = this;

    var yml;
    if(process.argv.indexOf("-y") != -1){ //does our flag exist?
      yml = process.argv[process.argv.indexOf("-y") + 1]; //grab the next item
      // load file to a string. need better error handling.
      this.config = this.loadYaml(yml);
      this.parsePages();
    }
    else {
      // otherwise we prompt the user.
      prompt.start();
      prompt.get(inputs, function (err, inputs) {
          if (err) { return onErr(err); }
          yml = inputs.config;
          // load file to a string. need better error handling.
          that.config = that.loadYaml(inputs.config);
          that.parsePages();
      });
    }
    return this;
  },
  loadYaml : function(yml) {
    return yaml.safeLoad(fs.readFileSync(yml, 'utf8'));
  },
  parsePages : function() {
    if (!this.config.preview) {
      this.config.preview = 0;
    }
    console.log(this.config);
    urlStream = fs.readFileSync(this.config.inputfile, 'utf-8');

    var that = this;
    papa.parse(urlStream, {
      // file has a header row.
      header : true,
      // use preview option to load only a subset of the available data.
      // Set to 0 for all content.
      preview : that.config.preview,
      skipEmptyLines : true,
      complete : function(results) {
        console.log(colors.verbose('Getting page URLs: %s items found.'), results.data.length);
        that.pageList = results.data;
        that.getPages();
    	},
      error: function(error,file) {
          var fn = arguments.callee;
          onErr(error, fn);
      }
    });

    return this;
  },
  getPages : function () {
    console.log('Accessing page contents. Please wait.'.verbose);

    var that = this;
    var requests = [];
    for(var i = 0, len = this.pageList.length; i < len; i++) {

      var row = this.pageList[i];

      // with no URL, we have no reason to be here.
      if ( !row.URL.length  || row.Notes == 'Dead link') {
        console.log(colors.error("Item is not crawlable: %s"), row.URL, row.Notes);
        continue;
      }

      var options = {
        uri : row.URL,
        row : row,
        resolveWithFullResponse : true,
        transform2xxOnly : true,
        transform : function (body, response) {
          if ( !response ) {
            console.log(colors.error("Response was invalid."));
            return;
          }
          return {
            body : body,
            meta : response.request.row
          };
        },

      };

      requests.push(
        request(options)
        .then(function(data) {
          $ = cheerio.load(data.body);

          var content = $(that.config.content),
              head = $('head');

          // We can add to this list as needed.
          // There's a better way to build this, but this will work for now.
          var title = content.find(that.config.item.title),
              byline = content.find(that.config.item.byline),
              body = content.find(that.config.item.body),
              tax1 = content.find(that.config.item.tax1),
              tax2 = content.find(that.config.item.tax2),
              profileTitle = content.find(that.config.item.profileTitle),
              profileCompany = content.find(that.config.item.profileCompany);

          // body will default to the main content area if nothing is
          // specified.
          if (!body.length) {
            body = $(that.config.content);
          }
          // Let's make sure we remove title, etc. since we KNOW we are storing
          // those elsewhere.
          body.find(title, byline, tax1, tax2).remove();

          // profile fields
          body.find(profileTitle, profileCompany).remove();

          // build item that we'll log to the content CSV.
          var item = {
            // Structure here assumes the spreadsheet follows XML sitemap
            // format: URL | Type | Title | Date | Level | Description | Rating
            // We also have a Notes column that we're referencing here.
            postType : that.config.posttype,
            metaTitle : data.meta.Title,
            metaKeywords : head.find('meta[name="keywords"]').attr('content'),
            metaDesc : data.meta.Description,
            pubDate : data.meta.Date,

            // user defined fields in YML config
            title : that.scrub(title.first().text()),
            byline : byline.first().text(),
            body : that.scrub(body.html()),
            tax1 : that.scrub(tax1.toArray(), true),
            tax2 : that.scrub(tax2.toArray(), true),
            profileTitle : that.scrub(profileTitle.first().text()),
            profileCompany : that.scrub(profileCompany.first().text()),
          };

          that.data.push(item);

          // perception of progress!
          console.log(title.text().verbose, 'has been parsed.');
        })
        .catch(function(err) {
          var msg = err.name + ': ' + err.message;
          if(err.statusCode) {
            msg = err.name + ': ' + err.statusCode;
          }
          console.log(colors.error('Promise request failed: %s'), msg);
        })
      );
    } // end loop.

    Promise.all(requests).then(function() {
      that.writeContent();
    })
    .catch(function(err) {
      console.log( colors.error("PromiseAll request failed: %s"), err );
    });
  },
  writeContent : function () {
    // we had no successful requests; can't write a file.
    if (!this.data.length) {
      console.log("No successful page requests were made.".info);
      //return;
    }

    console.log('Writing CSV.');

    var writer = csvWriter(
      { headers : Object.keys(this.data[0]) }
    ),
        filename = this.config.posttype + '-content.csv';
    writer.pipe(fs.createWriteStream(filename));
    // this can't be right... but it works.
    for(var i = 0, len = this.data.length; i < len; i++) {
      writer.write(this.data[i]);
    }
    writer.end();
    console.log(colors.info('File "%s" created successfully.'), filename);
  },
  scrub : function (content, implode) {
    if (!implode) implode = false;

    switch(typeof content) {
      case 'string':
        return content.trim().replace(/[\x00-\x1F\x7F-\x9F]/g, "");
      case 'array', 'object':
        if(implode) {
          var txt = [];
          for(var i = 0, len = content.length; i < len; i++) {
            // we are getting a jQuery style object from Cheerio.
            txt.push(content[i].children[0].data);
          }
          return txt.join(',');
        }
        return content;

      default:
        return content;
    }
  }
};

function onErr(err,fn) {
  console.log('Error from',fn,":", err);
  return true;
}

function addslashes( str ) {
  return (str + '').replace(/[\\"']/g, '\\$&').replace(/\u0000/g, '\\0');
}

function htmlEncode ( str ) {
  str = str.replace(/[\u00A0-\u9999<>\&]/gim, function(i) {
    return '&#'+i.charCodeAt(0)+';';
  });
  return str;
}

buildContent.init();
