'use strict';

// Imports dependencies and set up http server
const
  express = require('express'),
  bodyParser = require('body-parser'),
  request = require('request'),
  app = express().use(bodyParser.json()); // creates express http server
  
// Set up Dialogflow for small talk
const apiai = require('apiai');
const APIAI_TOKEN = process.env.APIAI_TOKEN; // token in heroku config
const apiaiApp = apiai(APIAI_TOKEN);

// Set up Yelp Fusion API
const YELP_TOKEN = process.env.YELP_TOKEN // token in heroku config
const yelp = require('yelp-fusion');
const yelpClient = yelp.client(YELP_TOKEN);

// Set up OpenWeatherMap API
const WEATHER_APIKEY = process.env.WEATHER_APIKEY;

const PAGE_ACCESS_TOKEN = process.env.FB_MSGR_ACCESS_TOKEN // page access token in heroku config

// Sets server port and logs message on success
app.listen(process.env.PORT || 1337, () => console.log('Weber the Webhook is listening on port 1337!'));

// Set reply to index route
app.get('/', function (req, res) {
	res.send("Hello world! I am a Facebook Messenger chatbot created by Raymond Guo.");
});

// Adds support for GET requests to our webhook
app.get('/webhook', (req, res) => {

  // Set verify token
  const VERIFY_TOKEN = "uh-let-me-in-plz";
    
  // Parse the query params
  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];
    
  // Checks if a token and mode is in the query string of the request
  if (mode && token) {
  
    // Checks the mode and token sent is correct
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      
      // Responds with the challenge token from the request
      //console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    
    } else {
      // Responds with '403 Forbidden' if verify tokens do not match
      res.sendStatus(403);      
    }
  }
});

// Creates the endpoint for our webhook 
app.post('/webhook', (req, res) => {  
 
  let body = req.body;

  // Checks this is an event from a page subscription
  if (body.object === 'page') {

    // Iterates over each entry - there may be multiple if batched
	  body.entry.forEach(function(entry) {

	  // Gets the body of the webhook event
	  let webhook_event = entry.messaging[0];
	  //console.log(webhook_event);

	  // Get the sender PSID
	  let sender_psid = webhook_event.sender.id;
	  //console.log('Sender PSID: ' + sender_psid);

	  // Check if the event is a message or postback and
	  // pass the event to the appropriate handler function
	  if (webhook_event.message) {
	    handleMessage(sender_psid, webhook_event.message);        
	  } else if (webhook_event.postback) {
	    handlePostback(sender_psid, webhook_event.postback);
	  }
	  
	});
    // Returns a '200 OK' response to all requests
    res.status(200).send('EVENT_RECEIVED');
  } else {
    // Returns a '404 Not Found' if event is not from a page subscription
    res.sendStatus(404);
  }

});

// Handles messages events
function handleMessage(sender_psid, received_message) {

  let responseMessenger;

  // Check if the message contains text
  if (received_message.text) {    
    
    if (received_message.text.toLowerCase() === "help") {
      responseMessenger = {
        "attachment": {
        "type": "template",
        "payload": {
          "template_type": "button",
          "text": "I'm a Facebook Messenger chatbot created by Raymond. I'm a travel advising companion, integrating together APIs that provide weather, hotel, and dining information. Try some of the entries below!",
          "buttons": [
			        {
                "type": "postback",
                "title": "Pizza in Boston?",
                "payload": "food",
              },
              {
                "type": "postback",
                "title": "Hiking in Portland?",
                "payload": "tourist",
              },
              {
                "type": "postback",
                "title": "Hotels in Vegas?",
                "payload": "hotel",
              }
            ]
          }
        }
      }
      callSendAPI(sender_psid, responseMessenger);  
      
    } else {
      let dialogflow = apiaiApp.textRequest(received_message.text, {
        sessionId: 'dialogflow-session' // use any arbitrary id
      });
    
      dialogflow.on('response', (responseDialog) => {
        console.log(responseDialog);
        responseMessenger = { "text": responseDialog.result.fulfillment.speech }
        
        callSendAPI(sender_psid, responseMessenger);  
       });
    
      dialogflow.on('error', (error) => {
        console.log(error);
      });
    
      dialogflow.end();  
    }
  } else {
    responseMessenger = {
    "text": "Sorry, I don't know how to respond. Try typing 'help' to get a list of my functionalities."
    }
    callSendAPI(sender_psid, responseMessenger);    
  }
}

// Handles messaging_postbacks events
function handlePostback(sender_psid, received_postback) {
  let responseMessenger;
  
  // Get the payload for the postback
  let payload = received_postback.payload;
  console.log("payload");

  // Set the response based on the postback payload
  if (payload === 'food') {
    yelpClient.search({
      term:'pizza',
      location: 'Boston'
    }).then(response => {
      let firstB = response.jsonBody.businesses[0];
      let secB = response.jsonBody.businesses[1];
      let thirdB = response.jsonBody.businesses[2];
      let msg = "The top pizza restaurants in the city of Boston are: " + firstB.name + " (" + firstB.price + ", " + firstB.rating + " stars with " + firstB.review_count + " reviews), " 
                                                                             + secB.name + " (" + secB.price + ", " + secB.rating + " stars with " + secB.review_count + " reviews), and " 
                                                                             + thirdB.name + " (" + thirdB.price + ", " + thirdB.rating + " stars with " + thirdB.review_count + " reviews).";
      
      responseMessenger = produceResponseTemplate(firstB, secB, thirdB, msg);
      callSendAPI(sender_psid, responseMessenger);  
    }).catch(e => {
      console.log(e);
    });
  } else if (payload === 'tourist') {
    yelpClient.search({
      term:'hiking',
      location: 'Portland'
    }).then(response => {
      let firstB = response.jsonBody.businesses[0];
      let secB = response.jsonBody.businesses[1];
      let thirdB = response.jsonBody.businesses[2];
      let msg = "The top hiking spots in the city of Portland are: " + firstB.name + " (" + firstB.rating + " stars with " + firstB.review_count + " reviews), " 
                                                                             + secB.name + " (" + secB.rating + " stars with " + secB.review_count + " reviews), and " 
                                                                             + thirdB.name + " (" + thirdB.rating + " stars with " + thirdB.review_count + " reviews).";
      
      responseMessenger = produceResponseTemplate(firstB, secB, thirdB, msg);
      callSendAPI(sender_psid, responseMessenger);  
    }).catch(e => {
      console.log(e);
    });
  } else if (payload === 'hotel') {
    yelpClient.search({
      term:'hotel',
      location: 'Las Vegas'
    }).then(response => {
      let firstB = response.jsonBody.businesses[0];
      let secB = response.jsonBody.businesses[1];
      let thirdB = response.jsonBody.businesses[2];
      let msg = "The top hotels in the city of Las Vegas are: " + firstB.name + " (" + firstB.price + ", " + firstB.rating + " stars with " + firstB.review_count + " reviews), " 
                                                                             + secB.name + " (" + secB.price + ", " + secB.rating + " stars with " + secB.review_count + " reviews), and " 
                                                                             + thirdB.name + " (" + thirdB.price + ", " + thirdB.rating + " stars with " + thirdB.review_count + " reviews).";
      
      responseMessenger = produceResponseTemplate(firstB, secB, thirdB, msg);
      callSendAPI(sender_psid, responseMessenger);  
    }).catch(e => {
      console.log(e);
    });
  } 
}

function produceResponseTemplate(firstB, secB, thirdB, msg) {
  return {
        "attachment": {
        "type": "template",
        "payload": {
          "template_type": "button",
          "text": msg,
          "buttons": [
			        {
                "type":"web_url",
                "url":firstB.url,
                "title":firstB.name,
              },
              {
                "type":"web_url",
                "url":secB.url,
                "title":secB.name,
              },
              {
                "type":"web_url",
                "url":thirdB.url,
                "title":thirdB.name,
              }
            ]
          }
        }
      };
}

// Sends response messages via the Send API
function callSendAPI(sender_psid, response) {
  // Construct the message body
  let request_body = {
    "recipient": {
      "id": sender_psid
    },
    "message": response
  }
  
  console.log(request_body);

  // Send the HTTP request to the Messenger Platform
  request({
    "uri": "https://graph.facebook.com/v2.6/me/messages",
    "qs": { "access_token": PAGE_ACCESS_TOKEN },
    "method": "POST",
    "json": request_body
  }, (err, res, body) => {
    if (!err) {
      //console.log('Message sent! The sent message contents: ', response);
    } else {
      console.error("Unable to send message:" + err);
    }
  }); 
}

app.post('/ai', (req, res) => {
  if (req.body.result.action === 'food') {
    console.log('*** food ***');
    let city = req.body.result.parameters['geo-city'];
    
    yelpClient.search({
      term:'food',
      location: city
    }).then(response => {
      let firstB = response.jsonBody.businesses[0];
      let secB = response.jsonBody.businesses[1];
      let thirdB = response.jsonBody.businesses[2];
      let msg = "The top restaurants in the city of " + city + " are: " + firstB.name + " (" + firstB.price + ", " + firstB.rating + " stars with " + firstB.review_count + " reviews), " 
                                                                                         + secB.name + " (" + secB.price + ", " + secB.rating + " stars with " + secB.review_count + " reviews), and " 
                                                                                         + thirdB.name + " (" + thirdB.price + ", " + thirdB.rating + " stars with " + thirdB.review_count + " reviews).";
                        
      return res.json({
          speech: msg,
          displayText: msg,
          source: 'food'
      });
    }).catch(e => {
      console.log(e);
      let errorMessage = 'I failed to look up the city name.';
        return res.status(400).json({
          status: {
            code: 400,
            errorType: errorMessage
          }
        });
    });
  } else if (req.body.result.action === 'foodtype') {
    console.log('*** foodtype ***');
    let city = req.body.result.parameters['geo-city'];
    let foodtype = req.body.result.parameters['food-type'];
    
    yelpClient.search({
      term: foodtype,
      location: city
    }).then(response => {
      let firstB = response.jsonBody.businesses[0];
      let secB = response.jsonBody.businesses[1];
      let thirdB = response.jsonBody.businesses[2];
      let msg = "The top " + foodtype + " restaurants in the city of " + city + " are: " + firstB.name + " (" + firstB.price + ", " + firstB.rating + " stars with " + firstB.review_count + " reviews), " 
                                                                                         + secB.name + " (" + secB.price + ", " + secB.rating + " stars with " + secB.review_count + " reviews), and " 
                                                                                         + thirdB.name + " (" + thirdB.price + ", " + thirdB.rating + " stars with " + thirdB.review_count + " reviews).";
                                                                                         
      return res.json({
          "speech": msg,
          "displayText": msg,
          "source": 'foodtype'
      });
    }).catch(e => {
      console.log(e);
      let errorMessage = 'I failed to look up the city name / food type.';
        return res.status(400).json({
          status: {
            code: 400,
            errorType: errorMessage
          }
        });
    });
  } else if (req.body.result.action === 'tourism') {
    console.log('*** tourism ***');
    let city = req.body.result.parameters['geo-city'];
    let tourismtype = req.body.result.parameters['tourism-type'];
    
    yelpClient.search({
      term: tourismtype,
      location: city
    }).then(response => {
      let firstB = response.jsonBody.businesses[0];
      let secB = response.jsonBody.businesses[1];
      let thirdB = response.jsonBody.businesses[2];
      let msg = "The top " + tourismtype + " spots in the city of " + city + " are: " + firstB.name + " (" + firstB.rating + " stars with " + firstB.review_count + " reviews), " 
                                                                                         + secB.name + " (" + secB.rating + " stars with " + secB.review_count + " reviews), and " 
                                                                                         + thirdB.name + " (" + thirdB.rating + " stars with " + thirdB.review_count + " reviews).";
                                                                                         
      return res.json({
          "speech": msg,
          "displayText": msg,
          "source": 'tourism'
      });
    }).catch(e => {
      console.log(e);
      let errorMessage = 'I failed to look up the city name / tourism type.';
        return res.status(400).json({
          status: {
            code: 400,
            errorType: errorMessage
          }
        });
    });
  } else if (req.body.result.action === 'hotel') {
    console.log('*** hotel ***');
    let city = req.body.result.parameters['geo-city'];
    
    yelpClient.search({
      term: "hotel",
      location: city
    }).then(response => {
      let firstB = response.jsonBody.businesses[0];
      let secB = response.jsonBody.businesses[1];
      let thirdB = response.jsonBody.businesses[2];
      let msg = "The top hotels in the city of " + city + " are: " + firstB.name + " (" + firstB.price + ", " + firstB.rating + " stars with " + firstB.review_count + " reviews), " 
                                                                                         + secB.name + " (" + secB.price + ", " + secB.rating + " stars with " + secB.review_count + " reviews), and " 
                                                                                         + thirdB.name + " (" + thirdB.price + ", " + thirdB.rating + " stars with " + thirdB.review_count + " reviews).";
                                                                                         
      return res.json({
          "speech": msg,
          "displayText": msg,
          "source": 'hotel'
      });
    }).catch(e => {
      console.log(e);
      let errorMessage = 'I failed to look up the city name.';
        return res.status(400).json({
          status: {
            code: 400,
            errorType: errorMessage
          }
        });
    });
  } else if (req.body.result.action === 'weather') {
    console.log('*** weather ***');
    let city = req.body.result.parameters['geo-city'];
    let apiUrl = 'http://api.openweathermap.org/data/2.5/weather?APPID='+WEATHER_APIKEY+'&q='+city+"&units=imperial";

    request.get(apiUrl, (err, response, body) => {
      if (!err && response.statusCode == 200) {
        let weatherResponse = JSON.parse(body);
        let msg =  "Today, the weather condition in " + weatherResponse.name + " are " + weatherResponse.weather[0].description + ", with a low of " + weatherResponse.main.temp_min + " ℉ and a high of " + weatherResponse.main.temp_max + " ℉. "
                    + "The current temperature is " + weatherResponse.main.temp + "℉, current humidity is at " + weatherResponse.main.humidity + "%, and cloud cover is at " + weatherResponse.clouds.all + "%. Winds are blowing at " + weatherResponse.wind.speed + "mph.";
        
        return res.json({
          speech: msg,
          displayText: msg,
          source: 'weather'
        });
      } else {
        let errorMessage = 'I failed to look up the city name.';
        return res.status(400).json({
          status: {
            code: 400,
            errorType: errorMessage
          }
        });
      }
    })
  }
});